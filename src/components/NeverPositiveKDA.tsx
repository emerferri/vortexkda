import { useState, useRef, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, Download, Image as ImageIcon, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NeverPositivePlayer {
  playerName: string;
  matchesPlayed: number;
  bestKda: number;
  totalKills: number;
  totalDeaths: number;
  guild?: string;
  class?: string;
}

export const NeverPositiveKDA = () => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const tableRef = useRef<HTMLDivElement>(null);

  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
    }, 500),
    []
  );

  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo);
  }, [dateFrom, dateTo, hourFrom, hourTo, debouncedSetFilters]);

  const { data: players = [], isLoading: loading } = useQuery({
    queryKey: ['never-positive-kda', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000,
    queryFn: async () => {
      // Build match query filtered to boss_event only
      let matchQuery = supabase.from('pvp_matches').select('id').eq('event_type', 'boss_event');

      if (debouncedDateFrom) {
        matchQuery = matchQuery.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
      }
      if (debouncedDateTo) {
        matchQuery = matchQuery.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
      }
      if (debouncedHourFrom !== undefined) {
        matchQuery = matchQuery.gte('match_hour', debouncedHourFrom);
      }
      if (debouncedHourTo !== undefined) {
        matchQuery = matchQuery.lte('match_hour', debouncedHourTo);
      }

      const { data: matches, error: matchError } = await matchQuery;
      if (matchError) throw matchError;

      const matchIds = matches?.map(m => m.id) || [];
      if (matchIds.length === 0) return [];

      // Fetch all match players with pagination (1000 row limit)
      let allMatchPlayers: { player_name: string; kills: number; deaths: number; kda: number; match_id: string }[] = [];
      const pageSize = 1000;
      let page = 0;
      while (true) {
        const { data: batch, error } = await supabase
          .from('pvp_match_players')
          .select('player_name, kills, deaths, kda, match_id')
          .in('match_id', matchIds)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!batch || batch.length === 0) break;
        allMatchPlayers = allMatchPlayers.concat(batch);
        if (batch.length < pageSize) break;
        page++;
      }

      // Fetch character info
      const { data: characters } = await supabase.from('characters').select('name, guild, class');
      const characterMap = new Map(
        characters?.map(char => [char.name.toLowerCase(), { guild: char.guild, class: char.class }]) || []
      );

      // Aggregate by player: track max KDA, total kills/deaths, match count
      const statsMap = new Map<string, { bestKda: number; totalKills: number; totalDeaths: number; matchesPlayed: number }>();

      allMatchPlayers.forEach(p => {
        const existing = statsMap.get(p.player_name);
        if (existing) {
          existing.bestKda = Math.max(existing.bestKda, Number(p.kda));
          existing.totalKills += p.kills;
          existing.totalDeaths += p.deaths;
          existing.matchesPlayed += 1;
        } else {
          statsMap.set(p.player_name, {
            bestKda: Number(p.kda),
            totalKills: p.kills,
            totalDeaths: p.deaths,
            matchesPlayed: 1,
          });
        }
      });

      // Filter: only players whose best KDA across all matches is <= 0
      const result: NeverPositivePlayer[] = [];
      statsMap.forEach((stats, playerName) => {
        if (stats.bestKda <= 0) {
          const charInfo = characterMap.get(playerName.toLowerCase());
          result.push({
            playerName,
            matchesPlayed: stats.matchesPlayed,
            bestKda: stats.bestKda,
            totalKills: stats.totalKills,
            totalDeaths: stats.totalDeaths,
            guild: charInfo?.guild,
            class: charInfo?.class,
          });
        }
      });

      // Sort by matches played DESC (more matches = more "persistence")
      result.sort((a, b) => b.matchesPlayed - a.matchesPlayed);
      return result;
    }
  });

  const exportToExcel = () => {
    const data = players.map((p, index) => ({
      'Posição': index + 1,
      'Jogador': p.playerName,
      'Classe': p.class || 'Sem Classe',
      'Guild': p.guild || 'Sem Guild',
      'Partidas': p.matchesPlayed,
      'Melhor KDA': p.bestKda,
      'Total Kills': p.totalKills,
      'Total Deaths': p.totalDeaths,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Nunca Positivo');
    XLSX.writeFile(workbook, 'nunca-positivo-kda.xlsx');
    toast.success('Arquivo Excel exportado com sucesso!');
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;
    try {
      const canvas = await html2canvas(tableRef.current);
      const link = document.createElement('a');
      link.download = 'nunca-positivo-kda.png';
      link.href = canvas.toDataURL();
      link.click();
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
      toast.error('Erro ao exportar imagem');
    }
  };

  const getPersistenceLevel = (matches: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } => {
    if (matches >= 10) return { label: 'Imbatível no Negativo', variant: 'destructive' };
    if (matches >= 5) return { label: 'Persistente', variant: 'destructive' };
    if (matches >= 3) return { label: 'Dedicado', variant: 'secondary' };
    return { label: 'Iniciante', variant: 'default' };
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

  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            Nenhum jogador encontrado que nunca teve KDA positivo. Parabéns a todos! 🎉
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
            <TrendingDown className="w-8 h-8 text-destructive" />
            <div>
              <CardTitle className="text-3xl">Nunca Tiveram KDA Positivo</CardTitle>
              <CardDescription className="text-base mt-1">
                Jogadores que NUNCA tiveram KDA positivo em nenhuma partida de Boss Event
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

        {/* Date and Hour Filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: ptBR }) : 'Data Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
            </PopoverContent>
          </Popover>

          <Select value={hourFrom?.toString() || "all"} onValueChange={(v) => setHourFrom(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Início" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>{i}:00</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hourTo?.toString() || "all"} onValueChange={(v) => setHourTo(v === "all" ? undefined : parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Hora Fim" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={i.toString()}>{i}:00</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setHourFrom(undefined); setHourTo(undefined); }}>
              Limpar Filtros
            </Button>
          )}
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
              <TableHead className="text-right">Partidas</TableHead>
              <TableHead className="text-right">Melhor KDA</TableHead>
              <TableHead className="text-right">Total Kills</TableHead>
              <TableHead className="text-right">Total Deaths</TableHead>
              <TableHead className="text-center">Nível</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player, index) => {
              const level = getPersistenceLevel(player.matchesPlayed);
              return (
                <TableRow key={player.playerName}>
                  <TableCell className="font-bold text-lg">
                    {index === 0 && '📉'}
                    {index === 1 && '👎'}
                    {index === 2 && '🥀'}
                    {index > 2 && `#${index + 1}`}
                  </TableCell>
                  <TableCell className="font-semibold">{player.playerName}</TableCell>
                  <TableCell className="text-muted-foreground">{player.class || 'Sem Classe'}</TableCell>
                  <TableCell className="text-muted-foreground">{player.guild || 'Sem Guild'}</TableCell>
                  <TableCell className="text-right font-bold">{player.matchesPlayed}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">{player.bestKda}</TableCell>
                  <TableCell className="text-right">{player.totalKills}</TableCell>
                  <TableCell className="text-right">{player.totalDeaths}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={level.variant}>{level.label}</Badge>
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
