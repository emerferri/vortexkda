import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Crown, Skull, Flame, Swords, Award, Heart, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

const RANKING_META: Record<string, { label: string; icon: any; color: string }> = {
  geral: { label: 'Ranking Geral', icon: Trophy, color: 'text-yellow-400' },
  reis_pvp: { label: 'Reis do PVP', icon: Crown, color: 'text-amber-400' },
  cones: { label: 'Cones Monodedo', icon: Skull, color: 'text-gray-400' },
  kill_streak: { label: 'Kill Streak', icon: Flame, color: 'text-orange-400' },
  mural_vergonha: { label: 'Mural da Vergonha', icon: Skull, color: 'text-red-400' },
  fogo_amigo: { label: 'Fogo Amigo', icon: Heart, color: 'text-pink-400' },
  putinha: { label: 'Minha Putinha', icon: Award, color: 'text-purple-400' },
};

export const HallDaFama = () => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [closing, setClosing] = useState(false);

  const { data: seasons, isLoading: loadingSeasons } = useQuery({
    queryKey: ['seasons-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const closedSeasons = (seasons || []).filter((s: any) => s.status === 'closed');
  const activeSeason = (seasons || []).find((s: any) => s.status === 'active');
  const currentId = selectedSeason || closedSeasons[0]?.id || '';

  const { data: snapshots, isLoading: loadingSnaps } = useQuery({
    queryKey: ['season-snapshots', currentId],
    enabled: !!currentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('season_snapshots')
        .select('*')
        .eq('season_id', currentId)
        .order('ranking_type')
        .order('position');
      if (error) throw error;
      return data || [];
    },
  });

  const handleCloseSeason = async () => {
    if (!confirm('Fechar a temporada atual? Isso salvará o snapshot Top 10 e abrirá uma nova temporada.')) return;
    setClosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('close-season');
      if (error) throw error;
      toast({
        title: 'Temporada fechada!',
        description: `${data?.snapshots ?? 0} registros salvos no Hall da Fama.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['seasons-list'] });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setClosing(false);
    }
  };

  const grouped: Record<string, any[]> = {};
  for (const s of snapshots || []) {
    (grouped[s.ranking_type] ||= []).push(s);
  }

  const currentSeason = (seasons || []).find((s: any) => s.id === currentId);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Hall da Fama
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Top 10 de cada ranking nas temporadas encerradas
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {activeSeason && (
          <Card className="gaming-card bg-primary/10 border-primary/40">
            <CardContent className="p-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold">Em andamento: {activeSeason.name}</span>
            </CardContent>
          </Card>
        )}

        {isAdmin && activeSeason && (
          <Button onClick={handleCloseSeason} disabled={closing} variant="destructive" size="sm">
            <Lock className="w-4 h-4 mr-1" />
            {closing ? 'Fechando...' : 'Fechar temporada atual'}
          </Button>
        )}
      </div>

      {loadingSeasons ? (
        <Skeleton className="h-10 w-64 mx-auto" />
      ) : closedSeasons.length === 0 ? (
        <Card className="gaming-card">
          <CardContent className="p-12 text-center text-muted-foreground">
            Nenhuma temporada encerrada ainda. Quando a primeira temporada for fechada, os campeões aparecerão aqui!
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex justify-center">
            <Select value={currentId} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecione uma temporada" />
              </SelectTrigger>
              <SelectContent>
                {closedSeasons.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.ended_at ? `(até ${new Date(s.ended_at).toLocaleDateString('pt-BR')})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {currentSeason && (
            <h3 className="text-center text-xl font-bold text-primary">
              🏆 {currentSeason.name}
            </h3>
          )}

          {loadingSnaps ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-80 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(RANKING_META).map(([type, meta]) => {
                const list = grouped[type];
                if (!list || list.length === 0) return null;
                const Icon = meta.icon;
                return (
                  <Card key={type} className="gaming-card">
                    <CardHeader className="pb-2">
                      <CardTitle className={`flex items-center gap-2 text-base ${meta.color}`}>
                        <Icon className="w-5 h-5" /> {meta.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ol className="space-y-1 text-sm">
                        {list.slice(0, 10).map((s: any) => (
                          <li key={s.id} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                            <span className="flex items-center gap-2 truncate">
                              <span className="font-bold w-7 shrink-0">
                                {s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : `#${s.position}`}
                              </span>
                              <span className="truncate font-medium">{s.player_name}</span>
                              {s.player_class && (
                                <span className="text-xs text-muted-foreground truncate">({s.player_class})</span>
                              )}
                            </span>
                            <span className="font-mono text-xs font-semibold shrink-0">{Number(s.score).toFixed(2)}</span>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
