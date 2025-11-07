import { useMemo, useState, useRef } from 'react';
import { Trophy, Skull, Crosshair, TrendingUp, Calendar as CalendarIcon, Download, FileImage, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AggregatedPlayer {
  name: string;
  class: string | null;
  kills: number;
  deaths: number;
  kda: number;
  weightedKda: number;
  matches: number;
  mvpScore: number;
  eventScore: number;
}

type SortKey = 'kills' | 'deaths' | 'kda' | 'weightedKda' | 'eventScore';

export const RankingGeral = () => {
  const [sortBy, setSortBy] = useState<SortKey>('eventScore');
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [classFilter, setClassFilter] = useState<string>('all');
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const tableRef = useRef<HTMLDivElement>(null);
  const specialCardsRef = useRef<HTMLDivElement>(null);

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('characters')
        .select('class')
        .not('class', 'is', null);
      
      if (error) throw error;
      
      const uniqueClasses = [...new Set(data?.map(c => (c.class || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
      return uniqueClasses.sort();
    }
  });

  // Normalização de classe e opções deduplicadas por chave canônica
  const normalizeClassKey = (s?: string) =>
    (s ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/(.)\1+/g, '$1'); // comprime letras repetidas (ex: wizzard -> wizard)

  const classOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    (classes || []).forEach((cls) => {
      const key = normalizeClassKey(cls);
      if (!map.has(key)) {
        map.set(key, { key, label: (cls || '').replace(/\s+/g, ' ').trim() });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [classes]);

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
          match_id,
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

      // Strong normalization function (remove diacritics, symbols, collapse spaces, lowercase)
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKD') // split diacritics
          .replace(/[\u0300-\u036f]/g, '') // remove diacritics
          .replace(/[^a-zA-Z0-9]/g, '') // remove ALL non-alphanumeric (including spaces)
          .toLowerCase();

      // Get all characters to map names to classes
      const { data: characters } = await supabase
        .from('characters')
        .select('name, class');

      const characterMap = new Map(
        (characters || []).map((c) => [normalize(c.name?.trim() || ''), (c.class || '').replace(/\s+/g, ' ').trim()])
      );

      // Prepare entries for fuzzy matching (fallback)
      const characterEntries = (characters || []).map((c) => ({
        norm: normalize(c.name?.trim() || ''),
        class: (c.class || '').replace(/\s+/g, ' ').trim(),
      }));

      // Lightweight Levenshtein with early exit (cap at distance 2)
      const levenshtein2 = (a: string, b: string) => {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > 2) return 3; // >2 directly
        const dp = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) dp[i][0] = i;
        for (let j = 0; j <= b.length; j++) dp[0][j] = j;
        let minInRow = 0;
        for (let i = 1; i <= a.length; i++) {
          minInRow = Number.MAX_SAFE_INTEGER;
          for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
              dp[i - 1][j] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j - 1] + cost
            );
            if (dp[i][j] < minInRow) minInRow = dp[i][j];
          }
          if (minInRow > 2) return 3; // early exit
        }
        return dp[a.length][b.length];
      };

      const findClosestClass = (normName: string): string | null => {
        let best: { dist: number; cls: string | null } = { dist: 3, cls: null };
        for (const entry of characterEntries) {
          const d = levenshtein2(normName, entry.norm);
          if (d < best.dist) best = { dist: d, cls: entry.class };
          if (best.dist === 0) break;
        }
        return best.dist <= 1 ? best.cls : null; // accept distance 0-1 only
      };

      // Calcular total de matches únicos no período (total de boss eventos)
      const uniqueMatches = new Set(data?.map((record: any) => record.match_id) || []);
      const totalBossEvents = uniqueMatches.size;

      // Aggregate by player para identificar cone monodedo
      // Using normalized keys for matching but keeping display names
      const playerMap = new Map<string, { kills: number; deaths: number; matches: number; displayName: string }>();
      
      data?.forEach((record: any) => {
        const display = (record.player_name || '').trim();
        const key = normalize(display);
        if (!key) return;
        
        const existing = playerMap.get(key) || { kills: 0, deaths: 0, matches: 0, displayName: display };
        playerMap.set(key, {
          kills: existing.kills + (record.kills || 0),
          deaths: existing.deaths + (record.deaths || 0),
          matches: existing.matches + 1,
          displayName: display
        });
      });

      // Identificar cone monodedo (quem mais morreu no total)
      let coneMonodedoName = '';
      let maxDeaths = 0;
      playerMap.forEach((stats, normKey) => {
        if (stats.deaths > maxDeaths) {
          maxDeaths = stats.deaths;
          coneMonodedoName = stats.displayName;
        }
      });

      // Encontrar recordes de kills em partidas únicas, excluindo cone monodedo
      const killRecords = data
        ?.filter((record: any) => {
          const display = (record.player_name || '').replace(/\s+/g, ' ').trim();
          return display !== coneMonodedoName;
        })
        .sort((a: any, b: any) => b.kills - a.kills) || [];
      
      const brabissimoRecord = killRecords.length > 0 
        ? { 
            name: (killRecords[0].player_name || '').replace(/\s+/g, ' ').trim(), 
            kills: killRecords[0].kills 
          }
        : { name: '', kills: 0 };

      const aggregated: AggregatedPlayer[] = Array.from(playerMap.entries()).map(([normKey, stats]) => {
        const kda = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
        // Nova fórmula: (kills / deaths) × (participações / total de boss eventos)
        const weightedKda = totalBossEvents > 0 
          ? kda * (stats.matches / totalBossEvents)
          : 0;
        // Cálculo de MVP: kills * 3 + kda * 2 - deaths * 1.5
        const mvpScore = (stats.kills * 3) + (kda * 2) - (stats.deaths * 1.5);
        // Pontuação do evento: kills * 3 + kda * 2 - deaths * 1.5
        const eventScore = (stats.kills * 3) + (kda * 2) - (stats.deaths * 1.5);
        return {
          name: stats.displayName,
          class: characterMap.get(normKey) || findClosestClass(normKey),
          kills: stats.kills,
          deaths: stats.deaths,
          kda,
          weightedKda,
          matches: stats.matches,
          mvpScore,
          eventScore
        };
      });

      return { aggregated, brabissimoRecord, coneMonodedoName, characters: (characters || []).map((c) => ({ name: (c.name || '').replace(/\s+/g, ' ').trim(), class: ((c.class || '').replace(/\s+/g, ' ').trim() || null) })) };
    }
  });

  const sortedPlayers = useMemo(() => {
    if (!aggregatedData?.aggregated) return [];
    
    // Normalizador local para nomes (consistente com o usado no fetch)
    const normalizeNameKey = (s?: string) =>
      (s ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const base = aggregatedData.aggregated;
    let filtered = base;

    if (classFilter !== 'all') {
      filtered = base.filter(p => normalizeClassKey(p.class || '') === classFilter);

      // Adiciona jogadores cadastrados na classe selecionada mesmo sem partidas (0 stats)
      const existing = new Set(filtered.map(p => normalizeNameKey(p.name)));
      const toAdd =
        (aggregatedData as any)?.characters
          ?.filter((c: any) => normalizeClassKey(c.class || '') === classFilter)
          ?.filter((c: any) => !existing.has(normalizeNameKey(c.name)))
          ?.map((c: any) => ({
            name: c.name,
            class: c.class || null,
            kills: 0,
            deaths: 0,
            kda: 0,
            weightedKda: 0,
            matches: 0,
            mvpScore: 0,
            eventScore: 0,
          })) || [];

      filtered = [...filtered, ...toAdd];
    }
    
    return [...filtered].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [aggregatedData, sortBy, classFilter]);

  const topPlayer = sortedPlayers[0];

  const reiDoPVP = useMemo(() => {
    // Rei do PVP usa MVP score: kills * 3 + kda * 2 - deaths * 1.5
    // Exclui o cone monodedo do cálculo
    const coneMonodedoName = aggregatedData?.coneMonodedoName;
    const eligiblePlayers = sortedPlayers.filter(p => p.name !== coneMonodedoName);
    return [...eligiblePlayers].sort((a, b) => b.mvpScore - a.mvpScore)[0];
  }, [sortedPlayers, aggregatedData]);

  const brabissimo = useMemo(() => {
    // Brabissimo é o player que mais matou em uma única partida
    if (!aggregatedData?.brabissimoRecord) return undefined;
    const playerData = sortedPlayers.find(p => p.name === aggregatedData.brabissimoRecord.name);
    return playerData ? { ...playerData, singleMatchKills: aggregatedData.brabissimoRecord.kills } : undefined;
  }, [aggregatedData, sortedPlayers]);

  const coneMonodedo = useMemo(() => {
    const coneMonodedoName = aggregatedData?.coneMonodedoName;
    return sortedPlayers.find(p => p.name === coneMonodedoName);
  }, [sortedPlayers, aggregatedData]);

  const melhorPonderado = useMemo(() => {
    return [...sortedPlayers].sort((a, b) => b.weightedKda - a.weightedKda)[0];
  }, [sortedPlayers]);

  const exportToExcel = () => {
    const worksheetData = [
      ['Ranking Geral - PVP'],
      [''],
      ['Rank', 'Jogador', 'Classe', 'Kills', 'Deaths', 'KDA', 'Pontuação', 'Boss'],
      ...sortedPlayers.map((player, index) => [
        index + 1,
        player.name,
        player.class || '-',
        player.kills,
        player.deaths,
        player.kda.toFixed(2),
        player.eventScore.toFixed(2),
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

  const publishToDiscord = async () => {
    if (!tableRef.current || !specialCardsRef.current) return;
    
    setIsPublishing(true);
    try {
      // Esconder elementos que não devem aparecer na imagem
      const kdaMedioCard = document.querySelector('[data-hide-on-export="kda-medio-card"]') as HTMLElement;
      const kdaMedioHeader = document.querySelector('[data-hide-on-export="kda-medio-header"]') as HTMLElement;
      const kdaMedioCells = document.querySelectorAll('[data-hide-on-export="kda-medio-cell"]');
      
      if (kdaMedioCard) kdaMedioCard.style.display = 'none';
      if (kdaMedioHeader) kdaMedioHeader.style.display = 'none';
      kdaMedioCells.forEach(cell => (cell as HTMLElement).style.display = 'none');
      
      // Ajustar grid para 3 colunas quando KDA/Médio estiver escondido
      if (specialCardsRef.current) {
        specialCardsRef.current.className = 'grid grid-cols-1 md:grid-cols-3 gap-4';
      }

      // Capturar os cards especiais como imagem
      const specialCardsCanvas = await html2canvas(specialCardsRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 1.5,
        logging: false,
        useCORS: true
      });

      let specialCardsImage = specialCardsCanvas.toDataURL('image/jpeg', 0.85);
      if (specialCardsImage.length > 7 * 1024 * 1024) {
        console.log('Special cards image too large, reducing quality...');
        specialCardsImage = specialCardsCanvas.toDataURL('image/jpeg', 0.7);
      }

      // Capturar a tabela como imagem com qualidade otimizada
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 1.5, // Reduzido de 2 para 1.5
        logging: false,
        useCORS: true
      });

      // Tentar com qualidade menor se a imagem for muito grande
      let imageData = canvas.toDataURL('image/jpeg', 0.85); // Reduzido de 0.95 para 0.85

      // Se ainda for muito grande (>7MB em base64), reduzir mais
      if (imageData.length > 7 * 1024 * 1024) {
        console.log('Image too large, reducing quality...');
        imageData = canvas.toDataURL('image/jpeg', 0.7);
      }

      console.log('Table image size:', (imageData.length / 1024 / 1024).toFixed(2), 'MB (as base64)');
      console.log('Special cards image size:', (specialCardsImage.length / 1024 / 1024).toFixed(2), 'MB (as base64)');

      // Get webhooks from localStorage
      const webhookHomolog = localStorage.getItem('DISCORD_WEBHOOK_URL');
      const webhookProd = localStorage.getItem('DISCORD_WEBHOOK_URL_PROD');
      
      const selectedWebhook = environment === 'prod' ? webhookProd : webhookHomolog;
      
      if (!selectedWebhook) {
        toast({
          title: 'Webhook não configurado',
          description: `Webhook de ${environment === 'prod' ? 'Produção' : 'Homologação'} não configurado. Configure na aba Admin.`,
          variant: 'destructive'
        });
        return;
      }

      const payload = {
        environment,
        webhookUrl: selectedWebhook,
        filters: {
          class: classFilter,
          dateFrom: dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined,
          dateTo: dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined,
          hourFrom,
          hourTo,
          sortBy
        },
        specialRankings: {
          reiDoPVP: {
            name: reiDoPVP?.name || '',
            kills: reiDoPVP?.kills || 0,
            deaths: reiDoPVP?.deaths || 0,
            matches: reiDoPVP?.matches || 0
          },
          brabissimo: {
            name: brabissimo?.name || '',
            singleMatchKills: brabissimo?.singleMatchKills || 0,
            matches: brabissimo?.matches || 0
          },
          coneMonodedo: {
            name: coneMonodedo?.name || '',
            deaths: coneMonodedo?.deaths || 0,
            matches: coneMonodedo?.matches || 0
          }
        },
        specialCardsImage,
        image: imageData,
        totals: {
          kills: sortedPlayers.reduce((sum, p) => sum + p.kills, 0),
          deaths: sortedPlayers.reduce((sum, p) => sum + p.deaths, 0),
          playerCount: sortedPlayers.length
        }
      };

      const { data, error } = await supabase.functions.invoke('discord-webhook', {
        body: payload
      });

      if (error) throw error;

      toast({
        title: 'Sucesso!',
        description: `Ranking publicado no Discord com imagem.`,
      });
      
      setShowDiscordModal(false);
    } catch (error: any) {
      console.error('Erro ao publicar no Discord:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao publicar no Discord',
        variant: 'destructive'
      });
    } finally {
      // Restaurar elementos escondidos
      const kdaMedioCard = document.querySelector('[data-hide-on-export="kda-medio-card"]') as HTMLElement;
      const kdaMedioHeader = document.querySelector('[data-hide-on-export="kda-medio-header"]') as HTMLElement;
      const kdaMedioCells = document.querySelectorAll('[data-hide-on-export="kda-medio-cell"]');
      
      if (kdaMedioCard) kdaMedioCard.style.display = '';
      if (kdaMedioHeader) kdaMedioHeader.style.display = '';
      kdaMedioCells.forEach(cell => (cell as HTMLElement).style.display = '');
      
      // Restaurar grid original
      if (specialCardsRef.current) {
        specialCardsRef.current.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
      }
      
      setIsPublishing(false);
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
            <span className="text-sm font-semibold text-muted-foreground">Classe:</span>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Todas as classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {classOptions?.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              setClassFilter('all');
            }}
            className="text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Classificações Especiais */}
      <div ref={specialCardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-success/10 border-2 border-success rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <Trophy className="w-10 h-10 text-success mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-success mb-2">👑 Rei do PVP</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{reiDoPVP?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-success font-bold">{reiDoPVP?.kills}</span> kills • <span className="text-destructive font-bold">{reiDoPVP?.deaths}</span> deaths
          </p>
          <p className="text-xs text-muted-foreground mt-1">{reiDoPVP?.matches} boss(es)</p>
        </div>

        <div className="bg-warning/10 border-2 border-warning rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-warning mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-warning mb-2">⚡ Brabissimo</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{brabissimo?.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="text-warning font-bold">{brabissimo?.singleMatchKills}</span> kills em 1 partida
          </p>
          <p className="text-xs text-muted-foreground mt-1">{brabissimo?.matches} boss(es)</p>
        </div>

        <div data-hide-on-export="kda-medio-card" className="bg-accent/10 border-2 border-accent rounded-xl p-6 text-center transform hover:scale-105 transition-all duration-300">
          <TrendingUp className="w-10 h-10 text-accent mx-auto mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-accent mb-2">📊 KDA/Médio</h3>
          <p className="text-2xl font-bold text-foreground text-glow mb-1">{melhorPonderado?.name}</p>
          <p className="text-sm text-muted-foreground">
            KDA/Médio: <span className="text-accent font-bold">{melhorPonderado?.weightedKda.toFixed(2)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">{melhorPonderado?.matches} boss(es)</p>
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
        <SortButton label="Pontuação" sortKey="eventScore" icon={Trophy} />
        <SortButton label="KDA/Médio" sortKey="weightedKda" icon={TrendingUp} />
        
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

        <div className="w-px h-8 bg-border mx-2" />

        <Button
          onClick={() => setShowDiscordModal(true)}
          variant="default"
          className="flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          Publicar no Discord
        </Button>
      </div>

      {/* Modal de Confirmação do Discord */}
      <Dialog open={showDiscordModal} onOpenChange={setShowDiscordModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar Ranking no Discord</DialogTitle>
            <DialogDescription>
              Confirme a publicação do ranking completo no canal do Discord.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Resumo:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• <strong>{sortedPlayers.length}</strong> jogadores serão enviados</li>
                <li>• Ordenação: <strong>{
                  sortBy === 'kills' ? 'Kills' :
                  sortBy === 'deaths' ? 'Deaths' :
                  sortBy === 'kda' ? 'KDA' :
                  sortBy === 'eventScore' ? 'Pontuação' :
                  'KDA/Médio'
                }</strong></li>
                {classFilter !== 'all' && <li>• Classe: <strong>{classFilter}</strong></li>}
                {(dateFrom || dateTo) && (
                  <li>• Período: {dateFrom && format(dateFrom, 'dd/MM/yyyy', { locale: ptBR })} 
                    {dateFrom && dateTo && ' - '} 
                    {dateTo && format(dateTo, 'dd/MM/yyyy', { locale: ptBR })}</li>
                )}
                {(hourFrom !== undefined || hourTo !== undefined) && (
                  <li>• Horário: {hourFrom !== undefined ? `${hourFrom}:00` : 'Início'} - {hourTo !== undefined ? `${hourTo}:00` : 'Fim'}</li>
                )}
              </ul>
            </div>

            <div className="bg-primary/10 p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Destaques:</p>
              <ul className="text-sm space-y-1">
                <li>👑 <strong>Rei do PVP:</strong> {reiDoPVP?.name} ({reiDoPVP?.kills} kills, {reiDoPVP?.deaths} deaths)</li>
                <li>⚡ <strong>Brabissimo:</strong> {brabissimo?.name} (KDA: {brabissimo?.kda.toFixed(2)})</li>
                <li>🍦 <strong>Cone Monodedo:</strong> {coneMonodedo?.name} ({coneMonodedo?.deaths} deaths)</li>
              </ul>
            </div>

            <div className="bg-card/50 p-4 rounded-lg border border-border space-y-3">
              <Label className="text-sm font-semibold">Ambiente de Publicação</Label>
              <RadioGroup value={environment} onValueChange={(value: 'homolog' | 'prod') => setEnvironment(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="homolog" id="homolog" />
                  <Label htmlFor="homolog" className="flex items-center gap-2 cursor-pointer font-normal">
                    🧪 Homologação (testes)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="prod" id="prod" />
                  <Label htmlFor="prod" className="flex items-center gap-2 cursor-pointer font-normal">
                    🚀 Produção (oficial)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDiscordModal(false)}
              disabled={isPublishing}
            >
              Cancelar
            </Button>
            <Button
              onClick={publishToDiscord}
              disabled={isPublishing}
            >
              {isPublishing ? 'Publicando...' : 'Confirmar Publicação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Classe
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
                <th className="px-6 py-4 text-center text-sm font-bold text-accent uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Pontuação
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
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">
                        {player.class || '-'}
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
                      <span className="font-bold text-accent text-lg">
                        {player.eventScore.toFixed(2)}
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
