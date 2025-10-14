import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Crosshair, Users, Sword, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { useNavigate } from 'react-router-dom';

interface PlayerWithCharacter {
  player_name: string;
  kills: number;
  deaths: number;
  class: string | null;
  guild: string | null;
}

interface AggregatedStats {
  name: string;
  totalKills: number;
  totalDeaths: number;
  playerCount: number;
  isGeneric?: boolean;
}

type FilterType = 'class' | 'guild';

export const ClassGuildRanking = () => {
  const [filterType, setFilterType] = useState<FilterType>('class');
  const navigate = useNavigate();

  const { data: playersData, isLoading } = useQuery({
    queryKey: ['players-with-characters'],
    queryFn: async () => {
      // Fetch all match players with their aggregate stats
      const { data: matchPlayers, error: matchError } = await supabase
        .from('pvp_match_players')
        .select('player_name, kills, deaths');

      if (matchError) throw matchError;

      // Aggregate stats by player name
      const playerStats = new Map<string, { kills: number; deaths: number }>();
      
      matchPlayers?.forEach((player) => {
        const existing = playerStats.get(player.player_name) || { kills: 0, deaths: 0 };
        playerStats.set(player.player_name, {
          kills: existing.kills + player.kills,
          deaths: existing.deaths + player.deaths,
        });
      });

      // Fetch all characters
      const { data: characters, error: charError } = await supabase
        .from('characters')
        .select('name, class, guild');

      if (charError) throw charError;

      const characterMap = new Map(
        characters?.map((char) => [char.name, { class: char.class, guild: char.guild }]) || []
      );

      // Combine data
      const result: PlayerWithCharacter[] = Array.from(playerStats.entries()).map(
        ([playerName, stats]) => {
          const character = characterMap.get(playerName);
          return {
            player_name: playerName,
            kills: stats.kills,
            deaths: stats.deaths,
            class: character?.class || null,
            guild: character?.guild || null,
          };
        }
      );

      return result;
    },
  });

  const aggregatedStats = useMemo(() => {
    if (!playersData) return [];

    const statsMap = new Map<string, AggregatedStats>();

    playersData.forEach((player) => {
      const key =
        filterType === 'class'
          ? player.class || 'Genérico (Sem Classe)'
          : player.guild || 'Genérico (Sem Guild)';

      const existing = statsMap.get(key) || {
        name: key,
        totalKills: 0,
        totalDeaths: 0,
        playerCount: 0,
        isGeneric: !player.class || !player.guild,
      };

      statsMap.set(key, {
        name: key,
        totalKills: existing.totalKills + player.kills,
        totalDeaths: existing.totalDeaths + player.deaths,
        playerCount: existing.playerCount + 1,
        isGeneric: key.includes('Genérico'),
      });
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalKills - a.totalKills);
  }, [playersData, filterType]);

  const unregisteredPlayers = useMemo(() => {
    if (!playersData) return [];
    return playersData.filter((p) => !p.class || !p.guild);
  }, [playersData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Crosshair className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {unregisteredPlayers.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {unregisteredPlayers.length} jogador(es) sem cadastro completo. Cadastre-os para
              estatísticas mais precisas.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/?tab=personagens')}
            >
              Gerenciar Personagens
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {filterType === 'class' ? (
              <Sword className="w-6 h-6 text-primary" />
            ) : (
              <Users className="w-6 h-6 text-primary" />
            )}
            <h2 className="text-2xl font-bold">
              Ranking por {filterType === 'class' ? 'Classe' : 'Guild'}
            </h2>
          </div>

          <Select
            value={filterType}
            onValueChange={(value) => setFilterType(value as FilterType)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="class">Por Classe</SelectItem>
              <SelectItem value="guild">Por Guild</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>{filterType === 'class' ? 'Classe' : 'Guild'}</TableHead>
                <TableHead className="text-right">Total Kills</TableHead>
                <TableHead className="text-right">Total Deaths</TableHead>
                <TableHead className="text-right">Jogadores</TableHead>
                <TableHead className="text-right">Média Kills</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedStats.map((stat, index) => (
                <TableRow
                  key={stat.name}
                  className={stat.isGeneric ? 'bg-muted/50' : ''}
                >
                  <TableCell className="font-medium">#{index + 1}</TableCell>
                  <TableCell className="font-semibold">
                    {stat.name}
                    {stat.isGeneric && (
                      <AlertCircle className="inline-block ml-2 w-4 h-4 text-yellow-600" />
                    )}
                  </TableCell>
                  <TableCell className="text-right text-green-600 font-bold">
                    {stat.totalKills}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {stat.totalDeaths}
                  </TableCell>
                  <TableCell className="text-right">{stat.playerCount}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(stat.totalKills / stat.playerCount).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            Total de {filterType === 'class' ? 'classes' : 'guilds'}:{' '}
            {aggregatedStats.length}
          </p>
          <p>
            Total de kills: {aggregatedStats.reduce((sum, s) => sum + s.totalKills, 0)}
          </p>
        </div>
      </Card>
    </div>
  );
};
