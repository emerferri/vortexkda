import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skull, Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

interface PlayerDeathStats {
  playerName: string;
  totalDeaths: number;
  totalKills: number;
  matchesPlayed: number;
  avgDeathsPerMatch: number;
  guild?: string;
  class?: string;
}

export const MuralDaVergonha = () => {
  const [deathStats, setDeathStats] = useState<PlayerDeathStats[]>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDeathStats();
  }, []);

  const loadDeathStats = async () => {
    try {
      setLoading(true);

      // Buscar todos os dados de jogadores
      const { data: matchPlayers, error: playersError } = await supabase
        .from('pvp_match_players')
        .select('player_name, kills, deaths');

      if (playersError) throw playersError;

      // Buscar informações de guild e classe dos personagens
      const { data: characters } = await supabase
        .from('characters')
        .select('name, guild, class');

      const characterMap = new Map(
        characters?.map(char => [char.name.toLowerCase(), { guild: char.guild, class: char.class }]) || []
      );

      // Agregar dados por jogador
      const statsMap = new Map<string, PlayerDeathStats>();

      matchPlayers?.forEach(player => {
        const charInfo = characterMap.get(player.player_name.toLowerCase());
        const existing = statsMap.get(player.player_name) || {
          playerName: player.player_name,
          totalDeaths: 0,
          totalKills: 0,
          matchesPlayed: 0,
          avgDeathsPerMatch: 0,
          guild: charInfo?.guild,
          class: charInfo?.class,
        };

        statsMap.set(player.player_name, {
          ...existing,
          totalDeaths: existing.totalDeaths + player.deaths,
          totalKills: existing.totalKills + player.kills,
          matchesPlayed: existing.matchesPlayed + 1,
        });
      });

      // Calcular média e ordenar por mais mortes
      const stats = Array.from(statsMap.values())
        .map(stat => ({
          ...stat,
          avgDeathsPerMatch: stat.totalDeaths / stat.matchesPlayed,
        }))
        .sort((a, b) => b.totalDeaths - a.totalDeaths);

      setDeathStats(stats);
    } catch (error) {
      console.error('Erro ao carregar estatísticas de mortes:', error);
      toast.error('Erro ao carregar o Mural da Vergonha');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = deathStats.map((stat, index) => ({
      'Posição': index + 1,
      'Jogador': stat.playerName,
      'Classe': stat.class || 'Sem Classe',
      'Guild': stat.guild || 'Sem Guild',
      'Total de Mortes': stat.totalDeaths,
      'Partidas Jogadas': stat.matchesPlayed,
      'Média Mortes/Partida': stat.avgDeathsPerMatch.toFixed(2),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mural da Vergonha');
    XLSX.writeFile(workbook, 'mural-da-vergonha.xlsx');
    toast.success('Arquivo Excel exportado com sucesso!');
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current);
      const link = document.createElement('a');
      link.download = 'mural-da-vergonha.png';
      link.href = canvas.toDataURL();
      link.click();
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
      toast.error('Erro ao exportar imagem');
    }
  };

  const getShameLevel = (deaths: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (deaths >= 100) return { label: 'Lendário da Vergonha', variant: 'destructive' };
    if (deaths >= 50) return { label: 'Mestre da Derrota', variant: 'destructive' };
    if (deaths >= 30) return { label: 'Expert em Morrer', variant: 'secondary' };
    return { label: 'Aprendiz', variant: 'default' };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Carregando dados...</div>
        </CardContent>
      </Card>
    );
  }

  if (deathStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            Nenhum dado encontrado. Aguardando registros de partidas.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={tableRef}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skull className="w-8 h-8 text-destructive" />
            <div>
              <CardTitle className="text-3xl">Mural da Vergonha</CardTitle>
              <CardDescription className="text-base mt-1">
                Os jogadores com mais mortes em todas as disputas
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToExcel} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button onClick={exportToImage} variant="outline" size="sm">
              <ImageIcon className="w-4 h-4 mr-2" />
              Imagem
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Rank</TableHead>
              <TableHead>Jogador</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Guild</TableHead>
              <TableHead className="text-right">Total Mortes</TableHead>
              <TableHead className="text-right">Partidas</TableHead>
              <TableHead className="text-right">Média Mortes</TableHead>
              <TableHead className="text-center">Nível de Vergonha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deathStats.map((stat, index) => {
              const shameLevel = getShameLevel(stat.totalDeaths);
              return (
                <TableRow key={stat.playerName}>
                  <TableCell className="font-bold text-lg">
                    {index === 0 && '💀'}
                    {index === 1 && '☠️'}
                    {index === 2 && '⚰️'}
                    {index > 2 && `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold">{stat.playerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {stat.class || 'Sem Classe'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {stat.guild || 'Sem Guild'}
                  </TableCell>
                  <TableCell className="text-right font-bold text-destructive">
                    {stat.totalDeaths}
                  </TableCell>
                  <TableCell className="text-right">{stat.matchesPlayed}</TableCell>
                  <TableCell className="text-right">
                    {stat.avgDeathsPerMatch.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={shameLevel.variant}>{shameLevel.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
