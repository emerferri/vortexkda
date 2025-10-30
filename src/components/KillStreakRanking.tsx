import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';

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
  { min: 2, max: 2, name: 'Double Kill', emoji: '🟠' },
  { min: 3, max: 3, name: 'Triple Kill', emoji: '🔥' },
  { min: 4, max: 4, name: 'Quadra Kill', emoji: '⚔️' },
  { min: 5, max: 5, name: 'Penta Kill', emoji: '💥' },
  { min: 6, max: 7, name: 'Killing Spree', emoji: '🔪' },
  { min: 8, max: 10, name: 'Rampage', emoji: '💣' },
  { min: 11, max: 14, name: 'Dominating', emoji: '⚡' },
  { min: 15, max: 19, name: 'Unstoppable', emoji: '🚀' },
  { min: 20, max: 24, name: 'Godlike', emoji: '👑' },
  { min: 25, max: Infinity, name: 'Legendary', emoji: '💀' },
];

const getStreakLevel = (streak: number) => {
  return STREAK_LEVELS.find(level => streak >= level.min && streak <= level.max) || STREAK_LEVELS[0];
};

export const KillStreakRanking = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();

  const { data: killLogs = [], isLoading } = useQuery({
    queryKey: ['kill-streak-logs', dateFrom, dateTo, hourFrom, hourTo],
    queryFn: async () => {
      let query = supabase
        .from('pvp_kill_logs')
        .select(`
          killer_name,
          victim_name,
          created_at,
          match_id,
          pvp_matches!inner(match_date, match_hour)
        `)
        .order('created_at', { ascending: true });

      if (dateFrom) {
        query = query.gte('pvp_matches.match_date', format(dateFrom, 'yyyy-MM-dd'));
      }
      if (dateTo) {
        query = query.lte('pvp_matches.match_date', format(dateTo, 'yyyy-MM-dd'));
      }
      if (hourFrom !== undefined) {
        query = query.gte('pvp_matches.match_hour', hourFrom);
      }
      if (hourTo !== undefined) {
        query = query.lte('pvp_matches.match_hour', hourTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as KillLog[];
    },
  });

  const streakRankings = useMemo(() => {
    if (!killLogs.length) return [];

    // Agrupar logs por jogador e calcular streaks
    const playerStreaks = new Map<string, number>();
    const playerMaxStreaks = new Map<string, number>();
    
    // Ordenar logs por tempo
    const sortedLogs = [...killLogs].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    sortedLogs.forEach(log => {
      const killer = log.killer_name;
      const victim = log.victim_name;

      // Incrementar streak do killer
      const currentKillerStreak = (playerStreaks.get(killer) || 0) + 1;
      playerStreaks.set(killer, currentKillerStreak);

      // Atualizar max streak do killer
      const currentMax = playerMaxStreaks.get(killer) || 0;
      if (currentKillerStreak > currentMax) {
        playerMaxStreaks.set(killer, currentKillerStreak);
      }

      // Resetar streak da vítima
      playerStreaks.set(victim, 0);
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

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl text-center">🏆 Ranking de Kill Streak</CardTitle>
          <p className="text-center text-muted-foreground">
            Maiores sequências de kills sem morrer
          </p>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Filtros</h3>
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

          {/* Legenda */}
          <Card className="mb-6 bg-muted/50">
            <CardHeader>
              <CardTitle className="text-lg">Níveis de Streak</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {STREAK_LEVELS.map((level) => (
                  <div key={level.name} className="flex items-center gap-2">
                    <span className="text-xl">{level.emoji}</span>
                    <span className="font-semibold">{level.name}</span>
                    <span className="text-muted-foreground">
                      ({level.max === Infinity ? `${level.min}+` : level.min === level.max ? level.min : `${level.min}-${level.max}`} kills)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Rankings */}
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : streakRankings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma streak encontrada para os filtros selecionados
            </div>
          ) : (
            <div className="space-y-3">
              {streakRankings.map((streak, index) => (
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
                          <div className="text-sm text-muted-foreground">
                            {streak.streakType}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
