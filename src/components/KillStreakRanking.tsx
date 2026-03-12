import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EventTypeFilter } from './EventTypeFilter';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CalendarIcon, X, Download, Send } from 'lucide-react';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface KillLog {
  killer_name: string;
  victim_name: string;
  created_at: string;
  match_id: string;
}

interface StreakData {
  player: string;
  maxStreak: number;
  streakType: string;
  emoji: string;
}

const STREAK_LEVELS = [
  { min: 2, max: 2, name: 'Double Kill', emoji: '🟠', description: 'Matou 2 inimigos sem morrer' },
  { min: 3, max: 3, name: 'Triple Kill', emoji: '🔥', description: 'Matou 3 inimigos sem morrer' },
  { min: 4, max: 4, name: 'Quadra Kill', emoji: '⚔️', description: 'Matou 4 inimigos sem morrer' },
  { min: 5, max: 5, name: 'Penta Kill', emoji: '💥', description: 'Matou 5 inimigos sem morrer' },
  { min: 6, max: 7, name: 'Killing Spree', emoji: '🔪', description: 'Continua matando sem morrer' },
  { min: 8, max: 10, name: 'Rampage', emoji: '💣', description: 'Está em uma sequência destruidora' },
  { min: 11, max: 14, name: 'Dominating', emoji: '⚡', description: 'Dominando o campo de batalha' },
  { min: 15, max: 19, name: 'Unstoppable', emoji: '🚀', description: 'Ninguém consegue parar' },
  { min: 20, max: 24, name: 'Godlike', emoji: '👑', description: 'Verdadeiro deus da arena' },
  { min: 25, max: Infinity, name: 'Legendary', emoji: '💀', description: 'Lenda viva – sequência absurda' },
];

const getStreakLevel = (streak: number) => {
  return STREAK_LEVELS.find(level => streak >= level.min && streak <= level.max) || STREAK_LEVELS[0];
};

export const KillStreakRanking = () => {
  const { user } = useAuth();
  const [eventType, setEventType] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const rankingRef = useRef<HTMLDivElement>(null);

  const { data: killLogs = [], isLoading } = useQuery({
    queryKey: ['kill-streak-logs', dateFrom, dateTo, hourFrom, hourTo, eventType],
    staleTime: 30000,
    queryFn: async () => {
      // First fetch match IDs with filters
      let matchQuery = supabase.from('pvp_matches').select('id');
      if (eventType !== 'all') matchQuery = matchQuery.eq('event_type', eventType);
      if (dateFrom) matchQuery = matchQuery.gte('match_date', format(dateFrom, 'yyyy-MM-dd'));
      if (dateTo) matchQuery = matchQuery.lte('match_date', format(dateTo, 'yyyy-MM-dd'));
      if (hourFrom !== undefined) matchQuery = matchQuery.gte('match_hour', hourFrom);
      if (hourTo !== undefined) matchQuery = matchQuery.lte('match_hour', hourTo);

      const { data: matches, error: matchError } = await matchQuery;
      if (matchError) throw matchError;
      const matchIds = matches?.map(m => m.id) || [];
      if (matchIds.length === 0) return [];

      // Fetch kill logs with pagination
      const pageSize = 1000;
      const BATCH_SIZE = 100;
      let allLogs: KillLog[] = [];

      for (let b = 0; b < matchIds.length; b += BATCH_SIZE) {
        const batchIds = matchIds.slice(b, b + BATCH_SIZE);
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('pvp_kill_logs')
            .select('killer_name, victim_name, created_at, match_id')
            .in('match_id', batchIds)
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (data && data.length > 0) allLogs = allLogs.concat(data as KillLog[]);
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }
      }

      return allLogs;
    },
  });

  const streakRankings = useMemo(() => {
    if (!killLogs.length) return [];

    // Agrupar logs por match_id
    const matchGroups = new Map<string, KillLog[]>();
    killLogs.forEach(log => {
      if (!matchGroups.has(log.match_id)) {
        matchGroups.set(log.match_id, []);
      }
      matchGroups.get(log.match_id)!.push(log);
    });

    // Calcular max streak de cada jogador considerando cada partida separadamente
    const playerMaxStreaks = new Map<string, number>();
    
    // Processar cada partida individualmente
    matchGroups.forEach((logs) => {
      // Ordenar logs da partida por tempo
      const sortedLogs = [...logs].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Calcular streaks dentro desta partida
      const playerStreaks = new Map<string, number>();

      sortedLogs.forEach(log => {
        const killer = log.killer_name;
        const victim = log.victim_name;

        // Incrementar streak do killer
        const currentKillerStreak = (playerStreaks.get(killer) || 0) + 1;
        playerStreaks.set(killer, currentKillerStreak);

        // Atualizar max streak global do killer
        const globalMax = playerMaxStreaks.get(killer) || 0;
        if (currentKillerStreak > globalMax) {
          playerMaxStreaks.set(killer, currentKillerStreak);
        }

        // Resetar streak da vítima
        playerStreaks.set(victim, 0);
      });
    });

    // Converter para array e ordenar
    const rankings: StreakData[] = Array.from(playerMaxStreaks.entries())
      .filter(([_, streak]) => streak >= 2) // Apenas streaks de 2+
      .map(([player, maxStreak]) => {
        const level = getStreakLevel(maxStreak);
        return {
          player,
          maxStreak,
          streakType: level.name,
          emoji: level.emoji,
        };
      })
      .sort((a, b) => b.maxStreak - a.maxStreak);

    return rankings;
  }, [killLogs]);

  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setHourFrom(undefined);
    setHourTo(undefined);
  };

  const hasFilters = dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined;

  const exportToJPG = async () => {
    if (!rankingRef.current) return;
    
    try {
      toast.info('Gerando imagem...');
      const canvas = await html2canvas(rankingRef.current, {
        backgroundColor: '#0a0a0b',
        scale: 2,
      });
      
      const link = document.createElement('a');
      link.download = `kill-streak-ranking-${format(new Date(), 'yyyy-MM-dd')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      
      toast.success('Ranking exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar ranking');
    }
  };

  const publishToDiscord = async () => {
    if (!rankingRef.current) return;
    
    setIsPublishing(true);
    try {
      const canvas = await html2canvas(rankingRef.current, {
        backgroundColor: '#0a0a0b',
        scale: 1.5,
        logging: false,
        useCORS: true
      });

      let imageData = canvas.toDataURL('image/jpeg', 0.85);
      
      if (imageData.length > 7 * 1024 * 1024) {
        console.log('Image too large, reducing quality...');
        imageData = canvas.toDataURL('image/jpeg', 0.7);
      }

      const top3 = streakRankings.slice(0, 3);
      
      const payload = {
        type: 'killstreak',
        environment,
        filters: {
          dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
          dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
          hourFrom,
          hourTo,
        },
        streakRankings: {
          first: top3[0] ? {
            name: top3[0].player,
            streak: top3[0].maxStreak,
            type: top3[0].streakType,
            emoji: top3[0].emoji
          } : null,
          second: top3[1] ? {
            name: top3[1].player,
            streak: top3[1].maxStreak,
            type: top3[1].streakType,
            emoji: top3[1].emoji
          } : null,
          third: top3[2] ? {
            name: top3[2].player,
            streak: top3[2].maxStreak,
            type: top3[2].streakType,
            emoji: top3[2].emoji
          } : null,
        },
        image: imageData,
        totals: {
          playerCount: streakRankings.length
        }
      };

      const { error } = await supabase.functions.invoke('discord-webhook', {
        body: payload
      });

      if (error) throw error;

      toast.success('Ranking publicado no Discord com sucesso!');
      setShowDiscordModal(false);
    } catch (error: any) {
      console.error('Erro ao publicar no Discord:', error);
      toast.error(error.message || 'Falha ao publicar no Discord');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl text-center">🏆 Ranking de Kill Streak</CardTitle>
              <p className="text-center text-muted-foreground">
                Maiores sequências de kills sem morrer
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={exportToJPG}
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={streakRankings.length === 0}
              >
                <Download className="w-4 h-4" />
                Exportar JPG
              </Button>
              
              {user && (
                <Button
                  onClick={() => setShowDiscordModal(true)}
                  variant="default"
                  size="sm"
                  className="gap-2"
                  disabled={streakRankings.length === 0}
                >
                  <Send className="w-4 h-4" />
                  Discord
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Filtros</h3>
              <EventTypeFilter value={eventType} onChange={setEventType} />
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 lg:px-3"
                >
                  <X className="w-4 h-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Data De */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Data De</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Selecione a data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Data Até */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Até</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Selecione a data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Hora De */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Hora De</label>
                <Select
                  value={hourFrom?.toString()}
                  onValueChange={(value) => setHourFrom(value ? parseInt(value) : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hora Até */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Hora Até</label>
                <Select
                  value={hourTo?.toString()}
                  onValueChange={(value) => setHourTo(value ? parseInt(value) : undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a hora" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Rankings */}
          <div ref={rankingRef} className="bg-background p-6 rounded-lg">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold mb-2">🏆 Ranking de Kill Streak</h2>
              <p className="text-muted-foreground">
                Maiores sequências de kills sem morrer
              </p>
            </div>
            
            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : streakRankings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma streak encontrada para os filtros selecionados
              </div>
            ) : (
              <div className="space-y-3">
                {streakRankings.map((streak, index) => {
                  const level = STREAK_LEVELS.find(l => l.name === streak.streakType);
                  return (
                    <Card
                      key={streak.player}
                      className={`transition-all hover:scale-[1.02] ${
                        index === 0 ? 'border-yellow-500 bg-yellow-500/10' :
                        index === 1 ? 'border-gray-400 bg-gray-400/10' :
                        index === 2 ? 'border-orange-600 bg-orange-600/10' :
                        'glass-card'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <span className="text-3xl font-bold text-muted-foreground">
                              #{index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{streak.emoji}</span>
                                <span className="font-bold text-lg">{streak.player}</span>
                              </div>
                              <div className="text-sm font-semibold text-primary">
                                {streak.streakType}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {level?.description}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-bold text-primary">
                              {streak.maxStreak}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              kills seguidos
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legenda */}
          <Card className="mt-6 bg-muted/50">
            <CardHeader>
              <CardTitle className="text-lg">Níveis de Streak</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {STREAK_LEVELS.map((level) => (
                  <div key={level.name} className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{level.emoji}</span>
                    <div className="flex-1">
                      <div className="font-semibold">{level.name}</div>
                      <div className="text-muted-foreground">{level.description}</div>
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      ({level.max === Infinity ? `${level.min}+` : level.min === level.max ? level.min : `${level.min}-${level.max}`} kills)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {/* Modal de Confirmação do Discord */}
      <Dialog open={showDiscordModal} onOpenChange={setShowDiscordModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar Ranking no Discord</DialogTitle>
            <DialogDescription>
              Selecione o ambiente onde deseja publicar o ranking de Kill Streak
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-4">
              <RadioGroup value={environment} onValueChange={(value) => setEnvironment(value as 'homolog' | 'prod')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="homolog" id="homolog" />
                  <Label htmlFor="homolog" className="cursor-pointer">
                    Homologação (Testes)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prod" id="prod" />
                  <Label htmlFor="prod" className="cursor-pointer">
                    Produção (Canal Principal)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDiscordModal(false)}
              disabled={isPublishing}
            >
              Cancelar
            </Button>
            <Button
              onClick={publishToDiscord}
              disabled={isPublishing}
            >
              {isPublishing ? 'Publicando...' : 'Confirmar Publicação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
