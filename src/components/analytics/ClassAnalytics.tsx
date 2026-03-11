import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crown, Zap, BarChart3, Target } from 'lucide-react';
import {
  AnalyticsFilters, fetchFilteredMatchIds, fetchKillLogsForMatches,
  fetchAllCharacters, buildCharacterMap, filterBanned, filterByGuild
} from '@/hooks/useAnalyticsData';

interface Props {
  filters: AnalyticsFilters;
}

interface ClassStat {
  className: string;
  players: number;
  kills: number;
  deaths: number;
  kda: number;
  efficiency: number; // kills/players
  dominanceScore: number; // (kills-deaths)/players
  pickRate: number;
}

interface ClassVsClass {
  killerClass: string;
  victimClass: string;
  kills: number;
}

export const ClassAnalytics = ({ filters }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-classes', filters],
    queryFn: async () => {
      const [matchIds, characters] = await Promise.all([
        fetchFilteredMatchIds(filters),
        fetchAllCharacters(),
      ]);
      const charMap = buildCharacterMap(characters);
      let logs = await fetchKillLogsForMatches(matchIds);
      logs = filterBanned(logs, charMap);
      logs = filterByGuild(logs, filters.guild, charMap);

      // Count players per class
      const classPlayers = new Map<string, Set<string>>();
      const activeChars = new Set<string>();
      for (const l of logs) {
        activeChars.add(l.killer_name);
        activeChars.add(l.victim_name);
      }

      for (const name of activeChars) {
        const c = charMap.get(name);
        const cls = c?.class || 'Desconhecido';
        if (!classPlayers.has(cls)) classPlayers.set(cls, new Set());
        classPlayers.get(cls)!.add(name);
      }

      const totalPlayers = activeChars.size;

      // Class kills/deaths
      const classKills = new Map<string, number>();
      const classDeaths = new Map<string, number>();
      const classVsClass: ClassVsClass[] = [];
      const cvcMap = new Map<string, Map<string, number>>();

      for (const l of logs) {
        const killerClass = charMap.get(l.killer_name)?.class || 'Desconhecido';
        const victimClass = charMap.get(l.victim_name)?.class || 'Desconhecido';

        classKills.set(killerClass, (classKills.get(killerClass) || 0) + 1);
        classDeaths.set(victimClass, (classDeaths.get(victimClass) || 0) + 1);

        if (!cvcMap.has(killerClass)) cvcMap.set(killerClass, new Map());
        const inner = cvcMap.get(killerClass)!;
        inner.set(victimClass, (inner.get(victimClass) || 0) + 1);
      }

      // Build CvC array
      for (const [kc, vm] of cvcMap) {
        for (const [vc, count] of vm) {
          classVsClass.push({ killerClass: kc, victimClass: vc, kills: count });
        }
      }

      // Build class stats
      const stats: ClassStat[] = [];
      const allClasses = new Set([...classPlayers.keys(), ...classKills.keys(), ...classDeaths.keys()]);

      for (const cls of allClasses) {
        const players = classPlayers.get(cls)?.size || 0;
        const kills = classKills.get(cls) || 0;
        const deaths = classDeaths.get(cls) || 0;

        stats.push({
          className: cls,
          players,
          kills,
          deaths,
          kda: deaths === 0 ? kills : Math.round((kills / deaths) * 100) / 100,
          efficiency: players === 0 ? 0 : Math.round((kills / players) * 100) / 100,
          dominanceScore: players === 0 ? 0 : Math.round(((kills - deaths) / players) * 100) / 100,
          pickRate: totalPlayers === 0 ? 0 : Math.round((players / totalPlayers) * 100),
        });
      }

      // Dominance matrix
      const classes = stats.filter(s => s.className !== 'Desconhecido').map(s => s.className).sort();
      const matrix: Record<string, Record<string, number>> = {};

      for (const kc of classes) {
        matrix[kc] = {};
        for (const vc of classes) {
          if (kc === vc) { matrix[kc][vc] = -1; continue; }
          const kills = cvcMap.get(kc)?.get(vc) || 0;
          const deaths = cvcMap.get(vc)?.get(kc) || 0;
          const total = kills + deaths;
          matrix[kc][vc] = total === 0 ? 50 : Math.round((kills / total) * 100);
        }
      }

      return { stats: stats.sort((a, b) => b.dominanceScore - a.dominanceScore), classVsClass, matrix, classes };
    },
    staleTime: 60000,
  });

  const meta = useMemo(() => {
    if (!data) return [];
    return [...data.stats]
      .filter(s => s.className !== 'Desconhecido' && s.players >= 2)
      .sort((a, b) => b.dominanceScore - a.dominanceScore);
  }, [data]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando dados das classes...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* META */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-warning" /> META do Servidor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {meta.map((c, i) => (
              <div key={c.className} className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2">
                <span className="text-lg font-bold text-muted-foreground">{i + 1}º</span>
                <span className="font-medium text-foreground">{c.className}</span>
                <Badge variant={c.dominanceScore > 0 ? 'default' : 'destructive'} className="text-xs">
                  {c.dominanceScore > 0 ? '+' : ''}{c.dominanceScore}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de Dominância</TabsTrigger>
          <TabsTrigger value="efficiency">Eficiência</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Pick Rate</TableHead>
                    <TableHead className="text-right">Kills</TableHead>
                    <TableHead className="text-right">Deaths</TableHead>
                    <TableHead className="text-right">KDA</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stats.map(c => (
                    <TableRow key={c.className}>
                      <TableCell className="font-medium text-foreground">{c.className}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c.players}</TableCell>
                      <TableCell className="text-right"><Badge variant="outline" className="text-xs">{c.pickRate}%</Badge></TableCell>
                      <TableCell className="text-right font-bold text-destructive">{c.kills}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c.deaths}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{c.kda}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.dominanceScore > 0 ? 'default' : 'destructive'}>
                          {c.dominanceScore > 0 ? '+' : ''}{c.dominanceScore}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4" /> Win Rate % (linha mata coluna)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10">Classe</TableHead>
                    {data.classes.map(c => <TableHead key={c} className="text-center text-xs">{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.classes.map(kc => (
                    <TableRow key={kc}>
                      <TableCell className="font-medium sticky left-0 bg-card z-10">{kc}</TableCell>
                      {data.classes.map(vc => {
                        const val = data.matrix[kc][vc];
                        const bg = val === -1 ? '' : val >= 55 ? 'bg-green-900/30 text-green-400' : val <= 45 ? 'bg-red-900/30 text-red-400' : 'text-muted-foreground';
                        return (
                          <TableCell key={vc} className={`text-center text-xs font-bold ${bg}`}>
                            {val === -1 ? '—' : `${val}%`}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="efficiency">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Kills</TableHead>
                    <TableHead className="text-right">Eficiência</TableHead>
                    <TableHead className="text-right">Score Dominância</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.stats].filter(c => c.className !== 'Desconhecido').sort((a, b) => b.efficiency - a.efficiency).map((c, i) => (
                    <TableRow key={c.className}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{c.className}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{c.players}</TableCell>
                      <TableCell className="text-right text-destructive">{c.kills}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{c.efficiency}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.dominanceScore > 0 ? 'default' : 'destructive'}>
                          {c.dominanceScore > 0 ? '+' : ''}{c.dominanceScore}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
