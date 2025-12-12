import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Crown, Trophy, Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ReiStats {
  player_name: string;
  vezes_rei: number;
  melhor_score: number;
  media_score: number;
}

interface HighlightData {
  maisVitorias: ReiStats | null;
  melhorScore: { player_name: string; score: number; date: string; hour: number } | null;
  melhorMedia: ReiStats | null;
}

export const ReisDoPVP = () => {
  const { data: reisRanking, isLoading } = useQuery({
    queryKey: ['reis-do-pvp'],
    queryFn: async () => {
      // First, get all matches with their top player
      const { data: matches, error: matchesError } = await supabase
        .from('pvp_matches')
        .select('id, match_date, match_hour');

      if (matchesError) throw matchesError;

      // Get all players for these matches
      const { data: players, error: playersError } = await supabase
        .from('pvp_match_players')
        .select('match_id, player_name, kills, deaths, kda');

      if (playersError) throw playersError;

      // Calculate event score and find the "Rei" for each match
      const reiPerMatch: { player_name: string; score: number; date: string; hour: number }[] = [];

      matches?.forEach(match => {
        const matchPlayers = players?.filter(p => p.match_id === match.id) || [];
        if (matchPlayers.length === 0) return;

        // Calculate event score for each player
        const playersWithScore = matchPlayers.map(p => ({
          ...p,
          eventScore: (p.kills * 3) + (p.kda * 2) - (p.deaths * 1.5)
        }));

        // Find the player with highest score
        const rei = playersWithScore.reduce((best, current) => 
          current.eventScore > best.eventScore ? current : best
        );

        reiPerMatch.push({
          player_name: rei.player_name,
          score: Number(rei.eventScore.toFixed(2)),
          date: match.match_date,
          hour: match.match_hour
        });
      });

      // Aggregate by player
      const playerStats: Record<string, { vezes: number; scores: number[]; melhorScore: number }> = {};
      
      reiPerMatch.forEach(rei => {
        if (!playerStats[rei.player_name]) {
          playerStats[rei.player_name] = { vezes: 0, scores: [], melhorScore: 0 };
        }
        playerStats[rei.player_name].vezes++;
        playerStats[rei.player_name].scores.push(rei.score);
        if (rei.score > playerStats[rei.player_name].melhorScore) {
          playerStats[rei.player_name].melhorScore = rei.score;
        }
      });

      // Convert to array and sort
      const ranking: ReiStats[] = Object.entries(playerStats).map(([name, stats]) => ({
        player_name: name,
        vezes_rei: stats.vezes,
        melhor_score: stats.melhorScore,
        media_score: Number((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2))
      })).sort((a, b) => b.vezes_rei - a.vezes_rei || b.melhor_score - a.melhor_score);

      // Find highlights
      const maisVitorias = ranking[0] || null;
      const melhorMedia = ranking.reduce((best, current) => 
        current.media_score > (best?.media_score || 0) ? current : best
      , null as ReiStats | null);
      const melhorScoreEvento = reiPerMatch.reduce((best, current) => 
        current.score > (best?.score || 0) ? current : best
      , null as typeof reiPerMatch[0] | null);

      return {
        ranking,
        highlights: {
          maisVitorias,
          melhorScore: melhorScoreEvento,
          melhorMedia
        } as HighlightData
      };
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="gaming-card">
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="gaming-card">
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { ranking, highlights } = reisRanking || { ranking: [], highlights: {} as HighlightData };

  return (
    <div className="space-y-6">
      {/* Highlights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mais Vitórias */}
        <Card className="gaming-card bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border-yellow-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-400">
              <Crown className="w-5 h-5" />
              Mais Vitórias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-300">{highlights.maisVitorias?.player_name || '-'}</p>
              <p className="text-lg text-yellow-400/80 mt-1">
                {highlights.maisVitorias?.vezes_rei || 0} vitórias como Rei
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Melhor score: {highlights.maisVitorias?.melhor_score?.toFixed(2) || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Maior Score */}
        <Card className="gaming-card bg-gradient-to-br from-red-500/20 to-orange-600/20 border-red-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <Target className="w-5 h-5" />
              Maior Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-300">{highlights.melhorScore?.player_name || '-'}</p>
              <p className="text-lg text-red-400/80 mt-1">
                Score: {highlights.melhorScore?.score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.melhorScore?.date ? new Date(highlights.melhorScore.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'} às {highlights.melhorScore?.hour || 0}h
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Melhor Média */}
        <Card className="gaming-card bg-gradient-to-br from-purple-500/20 to-violet-600/20 border-purple-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-purple-400">
              <TrendingUp className="w-5 h-5" />
              Melhor Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-300">{highlights.melhorMedia?.player_name || '-'}</p>
              <p className="text-lg text-purple-400/80 mt-1">
                Média: {highlights.melhorMedia?.media_score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.melhorMedia?.vezes_rei || 0} vitórias
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking Table */}
      <Card className="gaming-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            Ranking de Reis do PVP
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead className="text-center">Vitórias</TableHead>
                <TableHead className="text-center">Melhor Score</TableHead>
                <TableHead className="text-center">Média Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((rei, index) => (
                <TableRow key={rei.player_name} className={index < 3 ? 'bg-primary/5' : ''}>
                  <TableCell className="font-bold">
                    {index === 0 && <span className="text-yellow-400">🥇</span>}
                    {index === 1 && <span className="text-gray-400">🥈</span>}
                    {index === 2 && <span className="text-amber-600">🥉</span>}
                    {index > 2 && `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold">{rei.player_name}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-bold text-primary">{rei.vezes_rei}</span>
                  </TableCell>
                  <TableCell className="text-center">{rei.melhor_score.toFixed(2)}</TableCell>
                  <TableCell className="text-center">{rei.media_score.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {ranking.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado encontrado.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
