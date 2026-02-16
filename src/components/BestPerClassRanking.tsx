import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from './ui/table';
import { Award, Calendar, X, Crosshair } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

interface PlayerClassStats {
  player_name: string;
  className: string;
  totalKills: number;
  totalDeaths: number;
  totalKda: number;
  matchCount: number;
  eventScore: number;
}

export const BestPerClassRanking = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: bestPerClass, isLoading } = useQuery({
    queryKey: ['best-per-class', startDate, endDate],
    queryFn: async () => {
      // 1. Fetch matches (with optional date filter)
      let matchQuery = supabase.from('pvp_matches').select('id, match_date');
      if (startDate) matchQuery = matchQuery.gte('match_date', startDate);
      if (endDate) matchQuery = matchQuery.lte('match_date', endDate);
      const { data: matches, error: mErr } = await matchQuery;
      if (mErr) throw mErr;
      if (!matches?.length) return [];

      const matchIds = matches.map(m => m.id);

      // 2. Fetch all match_players with pagination
      const PAGE = 1000;
      let allPlayers: any[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('pvp_match_players')
          .select('player_name, kills, deaths, kda, match_id')
          .in('match_id', matchIds)
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        allPlayers = allPlayers.concat(data);
        if (data.length < PAGE) break;
        page++;
      }

      // 3. Fetch characters (non-banned, with class)
      const { data: characters, error: cErr } = await supabase
        .from('characters')
        .select('name, class')
        .eq('banned', false);
      if (cErr) throw cErr;

      const normalize = (s: string) =>
        (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

      const charMap = new Map(
        (characters || [])
          .filter(c => c.class && c.class.trim())
          .map(c => [normalize(c.name), c.class])
      );

      // 4. Aggregate per player
      const playerAgg = new Map<string, {
        displayName: string;
        kills: number;
        deaths: number;
        kda: number;
        matches: number;
      }>();

      for (const p of allPlayers) {
        const key = normalize(p.player_name);
        if (!key) continue;
        const ex = playerAgg.get(key) || { displayName: p.player_name, kills: 0, deaths: 0, kda: 0, matches: 0 };
        ex.kills += Number(p.kills);
        ex.deaths += Number(p.deaths);
        ex.kda += Number(p.kda);
        ex.matches += 1;
        ex.displayName = p.player_name;
        playerAgg.set(key, ex);
      }

      // 5. Find best player per class using eventScore = K*3 + KDA*2 - D*1.5
      const classBest = new Map<string, PlayerClassStats>();

      for (const [key, stats] of playerAgg) {
        const cls = charMap.get(key);
        if (!cls) continue;

        const eventScore = stats.kills * 3 + stats.kda * 2 - stats.deaths * 1.5;
        const current = classBest.get(cls);

        if (!current || eventScore > current.eventScore) {
          classBest.set(cls, {
            player_name: stats.displayName,
            className: cls,
            totalKills: stats.kills,
            totalDeaths: stats.deaths,
            totalKda: stats.kda,
            matchCount: stats.matches,
            eventScore,
          });
        }
      }

      return Array.from(classBest.values()).sort((a, b) => b.eventScore - a.eventScore);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Crosshair className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40 h-9 text-sm"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40 h-9 text-sm"
          />
        </div>
        {(startDate || endDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="gap-1 text-muted-foreground"
          >
            <X className="w-3 h-3" />
            Limpar
          </Button>
        )}
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Award className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Melhor Jogador por Classe</h2>
        </div>

        {!bestPerClass?.length ? (
          <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para o período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Jogador</TableHead>
                  <TableHead className="text-center">Kills</TableHead>
                  <TableHead className="text-center">Deaths</TableHead>
                  <TableHead className="text-center">KDA</TableHead>
                  <TableHead className="text-center">Partidas</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bestPerClass.map((entry, i) => (
                  <TableRow key={entry.className}>
                    <TableCell className="font-bold text-primary">{i + 1}</TableCell>
                    <TableCell className="font-semibold">{entry.className}</TableCell>
                    <TableCell className="font-medium">{entry.player_name}</TableCell>
                    <TableCell className="text-center text-success">{entry.totalKills}</TableCell>
                    <TableCell className="text-center text-destructive">{entry.totalDeaths}</TableCell>
                    <TableCell className="text-center">{entry.totalKda.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{entry.matchCount}</TableCell>
                    <TableCell className="text-center font-bold text-primary">{entry.eventScore.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};
