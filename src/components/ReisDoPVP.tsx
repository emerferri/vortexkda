import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Crown, Trophy, Target, TrendingUp, TrendingDown, Skull } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface PlayerStats {
  player_name: string;
  vezes: number;
  melhor_score: number;
  pior_score: number;
  media_score: number;
}

interface HighlightData {
  maisVezes: PlayerStats | null;
  extremeScore: { player_name: string; score: number; date: string; hour: number } | null;
  extremeMedia: PlayerStats | null;
}

type ViewMode = 'rei' | 'cone';

export const ReisDoPVP = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('rei');

  const { data: rankingData, isLoading } = useQuery({
    queryKey: ['reis-cone-pvp'],
    staleTime: 0, // Always refetch
    queryFn: async () => {
      console.log('[ReisDoPVP] Starting query...');
      const { data: matches, error: matchesError } = await supabase
        .from('pvp_matches')
        .select('id, match_date, match_hour');

      if (matchesError) throw matchesError;
      console.log('[ReisDoPVP] Fetched matches:', matches?.length);

      // Fetch ALL players - need to paginate since Supabase has 1000 row limit
      let allPlayers: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: playersPage, error: playersError } = await supabase
          .from('pvp_match_players')
          .select('match_id, player_name, kills, deaths, kda')
          .range(from, from + pageSize - 1);

        if (playersError) throw playersError;
        
        if (playersPage && playersPage.length > 0) {
          allPlayers = [...allPlayers, ...playersPage];
          from += pageSize;
          hasMore = playersPage.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const players = allPlayers;
      console.log('[ReisDoPVP] Fetched players:', players?.length);

      // Calculate Rei (highest score) and Cone (lowest score) for each match
      const reiPerMatch: { player_name: string; score: number; date: string; hour: number }[] = [];
      const conePerMatch: { player_name: string; score: number; date: string; hour: number }[] = [];

      matches?.forEach(match => {
        const matchPlayers = players?.filter(p => p.match_id === match.id) || [];
        if (matchPlayers.length === 0) return;

        const playersWithScore = matchPlayers.map(p => {
          // Ensure numeric types for calculation
          const kills = Number(p.kills) || 0;
          const deaths = Number(p.deaths) || 0;
          const kda = Number(p.kda) || 0;
          return {
            ...p,
            eventScore: (kills * 3) + (kda * 2) - (deaths * 1.5)
          };
        });

        // Find Rei (highest score)
        const rei = playersWithScore.reduce((best, current) => 
          current.eventScore > best.eventScore ? current : best
        );

        // Find Cone (lowest score)
        const cone = playersWithScore.reduce((worst, current) => 
          current.eventScore < worst.eventScore ? current : worst
        );

        reiPerMatch.push({
          player_name: rei.player_name,
          score: Number(rei.eventScore.toFixed(2)),
          date: match.match_date,
          hour: match.match_hour
        });

        conePerMatch.push({
          player_name: cone.player_name,
          score: Number(cone.eventScore.toFixed(2)),
          date: match.match_date,
          hour: match.match_hour
        });
      });

      console.log('[ReisDoPVP] Reis per match:', reiPerMatch.length);
      console.log('[ReisDoPVP] Sample reis:', reiPerMatch.slice(0, 5));

      // Aggregate Reis
      const reiStats: Record<string, { vezes: number; scores: number[]; melhorScore: number }> = {};
      reiPerMatch.forEach(rei => {
        if (!reiStats[rei.player_name]) {
          reiStats[rei.player_name] = { vezes: 0, scores: [], melhorScore: 0 };
        }
        reiStats[rei.player_name].vezes++;
        reiStats[rei.player_name].scores.push(rei.score);
        if (rei.score > reiStats[rei.player_name].melhorScore) {
          reiStats[rei.player_name].melhorScore = rei.score;
        }
      });

      const reiRanking: PlayerStats[] = Object.entries(reiStats).map(([name, stats]) => ({
        player_name: name,
        vezes: stats.vezes,
        melhor_score: stats.melhorScore,
        pior_score: Math.min(...stats.scores),
        media_score: Number((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2))
      })).sort((a, b) => b.vezes - a.vezes || b.melhor_score - a.melhor_score);

      console.log('[ReisDoPVP] Rei ranking top 5:', reiRanking.slice(0, 5));


      // Aggregate Cones
      const coneStats: Record<string, { vezes: number; scores: number[]; piorScore: number }> = {};
      conePerMatch.forEach(cone => {
        if (!coneStats[cone.player_name]) {
          coneStats[cone.player_name] = { vezes: 0, scores: [], piorScore: Infinity };
        }
        coneStats[cone.player_name].vezes++;
        coneStats[cone.player_name].scores.push(cone.score);
        if (cone.score < coneStats[cone.player_name].piorScore) {
          coneStats[cone.player_name].piorScore = cone.score;
        }
      });

      const coneRanking: PlayerStats[] = Object.entries(coneStats).map(([name, stats]) => ({
        player_name: name,
        vezes: stats.vezes,
        melhor_score: Math.max(...stats.scores),
        pior_score: stats.piorScore,
        media_score: Number((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length).toFixed(2))
      })).sort((a, b) => b.vezes - a.vezes || a.pior_score - b.pior_score);

      // Highlights for Rei
      const reiMaisVezes = reiRanking[0] || null;
      const reiMelhorMedia = reiRanking.reduce((best, current) => 
        current.media_score > (best?.media_score || 0) ? current : best
      , null as PlayerStats | null);
      const reiMelhorScore = reiPerMatch.reduce((best, current) => 
        current.score > (best?.score || 0) ? current : best
      , null as typeof reiPerMatch[0] | null);

      // Highlights for Cone
      const coneMaisVezes = coneRanking[0] || null;
      const conePiorMedia = coneRanking.reduce((worst, current) => 
        current.media_score < (worst?.media_score || Infinity) ? current : worst
      , null as PlayerStats | null);
      const conePiorScore = conePerMatch.reduce((worst, current) => 
        current.score < (worst?.score || Infinity) ? current : worst
      , null as typeof conePerMatch[0] | null);

      return {
        rei: {
          ranking: reiRanking,
          highlights: {
            maisVezes: reiMaisVezes,
            extremeScore: reiMelhorScore,
            extremeMedia: reiMelhorMedia
          }
        },
        cone: {
          ranking: coneRanking,
          highlights: {
            maisVezes: coneMaisVezes,
            extremeScore: conePiorScore,
            extremeMedia: conePiorMedia
          }
        }
      };
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center gap-2 mb-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
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

  const isRei = viewMode === 'rei';
  const currentData = isRei ? rankingData?.rei : rankingData?.cone;
  const { ranking, highlights } = currentData || { ranking: [], highlights: {} as HighlightData };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex justify-center gap-2 p-1 bg-muted/50 rounded-lg w-fit mx-auto">
        <Button
          variant={viewMode === 'rei' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('rei')}
          className="gap-2"
        >
          <Crown className="w-4 h-4" />
          Reis do PVP
        </Button>
        <Button
          variant={viewMode === 'cone' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('cone')}
          className="gap-2"
        >
          <Skull className="w-4 h-4" />
          Cones Monodedo
        </Button>
      </div>

      {/* Highlights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mais Vezes */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-yellow-500/20 to-amber-600/20 border-yellow-500/50' 
          : 'bg-gradient-to-br from-gray-500/20 to-slate-600/20 border-gray-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-yellow-400' : 'text-gray-400'}`}>
              {isRei ? <Crown className="w-5 h-5" /> : <Skull className="w-5 h-5" />}
              {isRei ? 'Mais Vitórias' : 'Mais Derrotas'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-yellow-300' : 'text-gray-300'}`}>
                {highlights.maisVezes?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-yellow-400/80' : 'text-gray-400/80'}`}>
                {highlights.maisVezes?.vezes || 0}x {isRei ? 'Rei' : 'Cone'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isRei ? 'Melhor' : 'Pior'} score: {isRei 
                  ? highlights.maisVezes?.melhor_score?.toFixed(2) 
                  : highlights.maisVezes?.pior_score?.toFixed(2) || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Extreme Score */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-red-500/20 to-orange-600/20 border-red-500/50' 
          : 'bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border-blue-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-red-400' : 'text-blue-400'}`}>
              <Target className="w-5 h-5" />
              {isRei ? 'Maior Score' : 'Menor Score'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-red-300' : 'text-blue-300'}`}>
                {highlights.extremeScore?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-red-400/80' : 'text-blue-400/80'}`}>
                Score: {highlights.extremeScore?.score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.extremeScore?.date 
                  ? new Date(highlights.extremeScore.date + 'T12:00:00').toLocaleDateString('pt-BR') 
                  : '-'} às {highlights.extremeScore?.hour || 0}h
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Extreme Média */}
        <Card className={`gaming-card ${isRei 
          ? 'bg-gradient-to-br from-purple-500/20 to-violet-600/20 border-purple-500/50' 
          : 'bg-gradient-to-br from-rose-500/20 to-pink-600/20 border-rose-500/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 ${isRei ? 'text-purple-400' : 'text-rose-400'}`}>
              {isRei ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {isRei ? 'Melhor Média' : 'Pior Média'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className={`text-3xl font-bold ${isRei ? 'text-purple-300' : 'text-rose-300'}`}>
                {highlights.extremeMedia?.player_name || '-'}
              </p>
              <p className={`text-lg mt-1 ${isRei ? 'text-purple-400/80' : 'text-rose-400/80'}`}>
                Média: {highlights.extremeMedia?.media_score?.toFixed(2) || 0}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {highlights.extremeMedia?.vezes || 0}x {isRei ? 'Rei' : 'Cone'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking Table */}
      <Card className="gaming-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isRei ? <Trophy className="w-6 h-6 text-primary" /> : <Skull className="w-6 h-6 text-muted-foreground" />}
            {isRei ? 'Ranking de Reis do PVP' : 'Ranking de Cones Monodedo'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead className="text-center">{isRei ? 'Vitórias' : 'Derrotas'}</TableHead>
                <TableHead className="text-center">{isRei ? 'Melhor Score' : 'Pior Score'}</TableHead>
                <TableHead className="text-center">Média Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((player, index) => (
                <TableRow key={player.player_name} className={index < 3 ? (isRei ? 'bg-primary/5' : 'bg-muted/20') : ''}>
                  <TableCell className="font-bold">
                    {index === 0 && <span>{isRei ? '🥇' : '💩'}</span>}
                    {index === 1 && <span>{isRei ? '🥈' : '🤡'}</span>}
                    {index === 2 && <span>{isRei ? '🥉' : '😭'}</span>}
                    {index > 2 && `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold">{player.player_name}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${isRei ? 'text-primary' : 'text-muted-foreground'}`}>
                      {player.vezes}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {isRei ? player.melhor_score.toFixed(2) : player.pior_score.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">{player.media_score.toFixed(2)}</TableCell>
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
