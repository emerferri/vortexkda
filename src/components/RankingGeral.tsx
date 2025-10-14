import { useMemo, useState, useRef } from 'react';
import { Trophy, Skull, Crosshair, TrendingUp, Calendar as CalendarIcon, Download, FileImage } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AggregatedPlayer {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
  matches: number;
}

type SortKey = 'kills' | 'deaths' | 'kda';

export const RankingGeral = () => {
  const [sortBy, setSortBy] = useState<SortKey>('kills');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: aggregatedData, isLoading } = useQuery({
    queryKey: ['ranking-geral', dateFrom, dateTo, hourFrom, hourTo],
    queryFn: async () => {
      let query = supabase
        .from('pvp_match_players')
        .select(`
          player_name,
          kills,
          deaths,
          kda,
          pvp_matches!inner(match_date, match_hour)
        `);

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

      // Aggregate by player
      const playerMap = new Map<string, { kills: number; deaths: number; matches: number }>();
      
      data?.forEach((record: any) => {
        const existing = playerMap.get(record.player_name) || { kills: 0, deaths: 0, matches: 0 };
        playerMap.set(record.player_name, {
          kills: existing.kills + record.kills,
          deaths: existing.deaths + record.deaths,
          matches: existing.matches + 1
        });
      });

      const aggregated: AggregatedPlayer[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
        name,
        kills: stats.kills,
        deaths: stats.deaths,
        kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
        matches: stats.matches
      }));

      return aggregated;
    }
  });

  const sortedPlayers = useMemo(() => {
    if (!aggregatedData) return [];
    return [...aggregatedData].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [aggregatedData, sortBy]);

  const topPlayer = sortedPlayers[0];

  const reiDoPVP = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.kills - a.kills)[0];
  }, [sortedPlayers]);

  const brabissimo = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.kda - a.kda)[0];
  }, [sortedPlayers]);

  const coneMonodedo = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.deaths - a.deaths)[0];
  }, [sortedPlayers]);

  const exportToExcel = () => {
    const worksheetData = [
      ['Ranking Geral - PVP'],
      [''],
      ['Rank', 'Jogador', 'Kills', 'Deaths', 'KDA', 'Boss'],
      ...sortedPlayers.map((player, index) => [
        index + 1,
        player.name,
        player.kills,
        player.deaths,
        player.kda.toFixed(2),
        player.matches
      ]),
      [''],
      ['Totais'],
      ['Total Kills', sortedPlayers.reduce((sum, p) => sum + p.kills, 0)],
      ['Total Deaths', sortedPlayers.reduce((sum, p) => sum + p.deaths, 0)],
      ['Total Jogadores', sortedPlayers.length]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ranking Geral');
    
    const fileName = `ranking-geral-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportToImage = async () => {
    if (!tableRef.current) return;

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2,
        logging: false
      });

      const link = document.createElement('a');
      link.download = `ranking-geral-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (error) {
      console.error('Erro ao exportar imagem:', error);
    }
  };

  const SortButton = ({ label, sortKey, icon: Icon }: { label: string; sortKey: SortKey; icon: any }) => (
    <button
      onClick={() => setSortBy(sortKey)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300",
        sortBy === sortKey
          ? "bg-primary text-primary-foreground glow-primary"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Carregando dados...</p>
      </div>
    );
  }

  if (!sortedPlayers || sortedPlayers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Crosshair className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado encontrado para o período selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros de Data e Hora */}
      <div className="bg-card/50 p-6 rounded-xl border border-border space-y-4">
        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">De:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Até:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Inicial:</span>
            <select
              value={hourFrom ?? ''}
              onChange={(e) => setHourFrom(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {[20, 21, 22].map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Hora Final:</span>
            <select
              value={hourTo ?? ''}
              onChange={(e) => setHourTo(e.target.value ? parseInt(e.target.value) : undefined)}
              className="px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Todas</option>
              {[20, 21, 22].map((hour) => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setDateFrom(undefined);
              setDateTo(undefined);
              setHourFrom(undefined);
              setHourTo(undefined);
            }}
            className="text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Classificações Especiais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-warning/10 border-2 border-warning rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Trophy className="w-10 h-10 text-warning mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-warning mb-2">👑 Rei do PVP</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoPVP?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-success font-bold">{reiDoPVP?.kills}</span> kills
          </p>
          <p className="text-xs text-muted-foreground mt-1">{reiDoPVP?.matches} boss(es)</p>
        </div>

        <div className="bg-primary/10 border-2 border-primary rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-primary mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-primary mb-2">⚡ Brabissimo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{brabissimo?.name}</p>
          <p className="text-sm text-muted-foreground">
            KDA: <span className="text-warning font-bold">{brabissimo?.kda.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{brabissimo?.matches} boss(es)</p>
        </div>

        <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Skull className="w-10 h-10 text-destructive mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-destructive mb-2">🍦 Cone monodedo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{coneMonodedo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive font-bold">{coneMonodedo?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{coneMonodedo?.matches} boss(es)</p>
        </div>
      </div>

      {/* Botões de ordenação e exportação */}
      <div className="flex flex-wrap gap-3 justify-center items-center">
        <SortButton label="Kills" sortKey="kills" icon={Crosshair} />
        <SortButton label="Deaths" sortKey="deaths" icon={Skull} />
        <SortButton label="KDA" sortKey="kda" icon={TrendingUp} />
        
        <div className="w-px h-8 bg-border mx-2" />
        
        <Button
          onClick={exportToExcel}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Excel
        </Button>
        
        <Button
          onClick={exportToImage}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <FileImage className="w-4 h-4" />
          JPG
        </Button>
      </div>

      {/* Tabela de Rankings */}
      <div ref={tableRef} className="overflow-hidden rounded-xl border border-border bg-card/50 backdrop-blur">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Jogador
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-success uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Crosshair className="w-4 h-4" />
                    Kills
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-destructive uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Skull className="w-4 h-4" />
                    Deaths
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-warning uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    KDA
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-sm font-bold text-primary uppercase tracking-wider">
                  Boss
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedPlayers.map((player, index) => {
                const isTopPlayer = player.name === topPlayer.name;
                return (
                  <tr
                    key={player.name}
                    className={cn(
                      "transition-all duration-300 hover:bg-secondary/30",
                      isTopPlayer && "bg-primary/5"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Trophy className="w-5 h-5 text-warning animate-pulse" />
                        )}
                        <span className={cn(
                          "font-bold text-lg",
                          index === 0 && "text-warning text-glow"
                        )}>
                          #{index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "font-semibold text-base",
                        isTopPlayer && "text-primary text-glow"
                      )}>
                        {player.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-success text-lg glow-success">
                        {player.kills}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-destructive text-lg glow-destructive">
                        {player.deaths}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-warning text-lg">
                        {player.kda.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-semibold text-muted-foreground">
                        {player.matches}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-success/10 border border-success/30 rounded-lg p-6 text-center">
          <Crosshair className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Kills</p>
          <p className="text-3xl font-bold text-success glow-success">
            {sortedPlayers.reduce((sum, p) => sum + p.kills, 0)}
          </p>
        </div>
        
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
          <Skull className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Total de Deaths</p>
          <p className="text-3xl font-bold text-destructive glow-destructive">
            {sortedPlayers.reduce((sum, p) => sum + p.deaths, 0)}
          </p>
        </div>
        
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 text-center">
          <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">Jogadores</p>
          <p className="text-3xl font-bold text-primary glow-primary">
            {sortedPlayers.length}
          </p>
        </div>
      </div>
    </div>
  );
};
