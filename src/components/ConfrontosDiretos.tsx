import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Swords, Search, X } from 'lucide-react';
import { toast } from 'sonner';

interface KillLog {
  id: string;
  killer_name: string;
  victim_name: string;
  match_id: string;
  created_at: string;
}

interface PlayerStats {
  playerName: string;
  totalKills: number;
  totalDeaths: number;
  victims: Map<string, number>;
  killers: Map<string, number>;
}

export const ConfrontosDiretos = () => {
  const [killLogs, setKillLogs] = useState<KillLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterName, setFilterName] = useState('');
  const [sortBy, setSortBy] = useState<'killer' | 'victim'>('killer');

  useEffect(() => {
    loadKillLogs();
  }, []);

  const loadKillLogs = async () => {
    try {
      setLoading(true);
      const pageSize = 1000; // fetch all rows in pages to avoid server max-rows cap
      let from = 0;
      let accumulated: KillLog[] = [];

      while (true) {
        const { data, error } = await supabase
          .from('pvp_kill_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) accumulated = accumulated.concat(data);
        if (!data || data.length < pageSize) break; // no more pages
        from += pageSize;
      }

      setKillLogs(accumulated);
    } catch (error) {
      console.error('Erro ao carregar logs de confrontos:', error);
      toast.error('Erro ao carregar confrontos diretos');
    } finally {
      setLoading(false);
    }
  };

  const getPlayerStats = (): PlayerStats[] => {
    const statsMap = new Map<string, PlayerStats>();

    killLogs.forEach(log => {
      // Processar killer
      if (!statsMap.has(log.killer_name)) {
        statsMap.set(log.killer_name, {
          playerName: log.killer_name,
          totalKills: 0,
          totalDeaths: 0,
          victims: new Map(),
          killers: new Map(),
        });
      }
      const killerStats = statsMap.get(log.killer_name)!;
      killerStats.totalKills++;
      killerStats.victims.set(
        log.victim_name,
        (killerStats.victims.get(log.victim_name) || 0) + 1
      );

      // Processar victim
      if (!statsMap.has(log.victim_name)) {
        statsMap.set(log.victim_name, {
          playerName: log.victim_name,
          totalKills: 0,
          totalDeaths: 0,
          victims: new Map(),
          killers: new Map(),
        });
      }
      const victimStats = statsMap.get(log.victim_name)!;
      victimStats.totalDeaths++;
      victimStats.killers.set(
        log.killer_name,
        (victimStats.killers.get(log.killer_name) || 0) + 1
      );
    });

    return Array.from(statsMap.values()).sort((a, b) => {
      if (sortBy === 'killer') {
        return a.playerName.localeCompare(b.playerName);
      }
      return b.totalKills - a.totalKills;
    });
  };

  const getFilteredStats = () => {
    const allStats = getPlayerStats();
    
    if (!filterName.trim()) {
      return allStats;
    }

    return allStats.filter(stat =>
      stat.playerName.toLowerCase().includes(filterName.toLowerCase())
    );
  };

  const filteredStats = getFilteredStats();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Carregando dados...</div>
        </CardContent>
      </Card>
    );
  }

  if (killLogs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            Nenhum confronto registrado. Aguardando dados de partidas.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="w-8 h-8 text-primary" />
            <div>
              <CardTitle className="text-3xl">Confrontos Diretos</CardTitle>
              <CardDescription className="text-base mt-1">
                Detalhes de quem matou quem nas disputas
              </CardDescription>
            </div>
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Filtrar por nome do jogador..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              className="pl-10 pr-10"
            />
            {filterName && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setFilterName('')}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={sortBy === 'killer' ? 'default' : 'outline'}
              onClick={() => setSortBy('killer')}
            >
              Ordenar por Nome
            </Button>
            <Button
              variant={sortBy === 'victim' ? 'default' : 'outline'}
              onClick={() => setSortBy('victim')}
            >
              Ordenar por Kills
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filterName && filteredStats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum jogador encontrado com o nome "{filterName}"
          </div>
        ) : (
          <div className="space-y-6">
            {filteredStats.map((stat) => (
              <div key={stat.playerName} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">{stat.playerName}</h3>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600 dark:text-green-400 font-semibold">
                      {stat.totalKills} Kills
                    </span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      {stat.totalDeaths} Mortes
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Matou */}
                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-muted-foreground">
                      Matou:
                    </h4>
                    {stat.victims.size > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jogador</TableHead>
                            <TableHead className="text-right">Vezes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(stat.victims.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([victim, count]) => (
                              <TableRow key={victim}>
                                <TableCell>{victim}</TableCell>
                                <TableCell className="text-right font-semibold">
                                  {count}x
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum kill registrado</p>
                    )}
                  </div>

                  {/* Morreu para */}
                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-muted-foreground">
                      Morreu para:
                    </h4>
                    {stat.killers.size > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jogador</TableHead>
                            <TableHead className="text-right">Vezes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from(stat.killers.entries())
                            .sort((a, b) => b[1] - a[1])
                            .map(([killer, count]) => (
                              <TableRow key={killer}>
                                <TableCell>{killer}</TableCell>
                                <TableCell className="text-right font-semibold">
                                  {count}x
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma morte registrada</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
