import { useMemo, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';
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
  guild: string | null;
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
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const [classFilter, setClassFilter] = useState<string>('all');
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [environment, setEnvironment] = useState<'homolog' | 'prod'>('homolog');
  const tableRef = useRef<HTMLDivElement>(null);
  const specialCardsRef = useRef<HTMLDivElement>(null);

  // Debounce filter updates
  const debouncedSetFilters = useCallback(
    debounce((from: Date | undefined, to: Date | undefined, hFrom: number | undefined, hTo: number | undefined) => {
      setDebouncedDateFrom(from);
      setDebouncedDateTo(to);
      setDebouncedHourFrom(hFrom);
      setDebouncedHourTo(hTo);
    }, 500),
    []
  );

  // Update debounced values when filters change
  useMemo(() => {
    debouncedSetFilters(dateFrom, dateTo, hourFrom, hourTo);
  }, [dateFrom, dateTo, hourFrom, hourTo, debouncedSetFilters]);

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
    queryKey: ['ranking-geral', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000, // Cache for 30 seconds
    queryFn: async () => {
      // Vamos unificar a fonte com Confrontos Diretos: agregaremos a partir de pvp_kill_logs
      // e aplicaremos filtros de data/hora através dos match_ids de pvp_matches

      // Normalizador forte (igual ao usado antes, removendo tudo que não é alfanumérico)
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();

      // Buscar classes/personagens para mapear nome -> classe e guild
      const { data: characters } = await supabase
        .from('characters')
        .select('name, class, guild');

      const entries = (characters || []).map((c) => {
        const displayName = (c.name ?? '').trim();
        const norm = normalize(displayName);
        const clsStr = ((c.class ?? '') as string).replace(/\s+/g, ' ').trim();
        const guildStr = ((c.guild ?? '') as string).replace(/\s+/g, ' ').trim();
        return { displayName, norm, cls: clsStr || null, guild: guildStr || null };
      });

      // Preferir classe não vazia quando houver duplicatas para o mesmo nome normalizado
      const characterMap = new Map<string, { class: string | null; guild: string | null }>();
      for (const e of entries) {
        const current = characterMap.get(e.norm);
        if (!current || e.cls) characterMap.set(e.norm, { class: e.cls, guild: e.guild });
      }

      // Preparar lista para fuzzy match (fallback)
      const characterEntries = Array.from(characterMap.entries()).map(([norm, data]) => ({
        norm,
        class: (data.class || '').toString(),
        guild: (data.guild || '').toString(),
      }));

      // Levenshtein limitado (até distância 1)
      const levenshtein2 = (a: string, b: string) => {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > 2) return 3;
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
          if (minInRow > 2) return 3;
        }
        return dp[a.length][b.length];
      };

      const findClosestCharacterData = (normName: string): { class: string | null; guild: string | null } => {
        let best: { dist: number; class: string | null; guild: string | null } = { dist: 3, class: null, guild: null };
        for (const entry of characterEntries) {
          const d = levenshtein2(normName, entry.norm);
          if (d < best.dist) best = { dist: d, class: entry.class, guild: entry.guild };
          if (best.dist === 0) break;
        }
        return best.dist <= 1 ? { class: best.class, guild: best.guild } : { class: null, guild: null };
      };

      // Se houver filtros de data/hora, filtramos pelos match_ids de pvp_matches
      const matchFilterActive = !!(debouncedDateFrom || debouncedDateTo || debouncedHourFrom !== undefined || debouncedHourTo !== undefined);
      let matchIds: string[] | undefined = undefined;

      if (matchFilterActive) {
        const pageSize = 1000;
        let from = 0;
        let matchesAccum: any[] = [];
        while (true) {
          let mq = supabase
            .from('pvp_matches')
            .select('id, match_date, match_hour');
          if (debouncedDateFrom) mq = mq.gte('match_date', format(debouncedDateFrom, 'yyyy-MM-dd'));
          if (debouncedDateTo) mq = mq.lte('match_date', format(debouncedDateTo, 'yyyy-MM-dd'));
          if (debouncedHourFrom !== undefined) mq = mq.gte('match_hour', debouncedHourFrom);
          if (debouncedHourTo !== undefined) mq = mq.lte('match_hour', debouncedHourTo);
          const { data: page, error } = await mq.range(from, from + pageSize - 1);
          if (error) throw error;
          if (page && page.length > 0) matchesAccum = matchesAccum.concat(page);
          if (!page || page.length < pageSize) break;
          from += pageSize;
        }
        matchIds = (matchesAccum || []).map((m: any) => m.id);
        if (!matchIds.length) {
          return { aggregated: [], brabissimoRecord: undefined, coneMonodedoName: '', characters: [] };
        }
      }

      // Buscar todos os logs (paginado) e opcionalmente filtrar por match_ids
      const pageSizeLogs = 1000;
      let fromLogs = 0;
      let logs: any[] = [];
      while (true) {
        let ql = supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name, match_id, created_at')
          .order('created_at', { ascending: false });
        if (matchIds) {
          ql = ql.in('match_id', matchIds);
        }
        const { data: page, error } = await ql.range(fromLogs, fromLogs + pageSizeLogs - 1);
        if (error) throw error;
        if (page && page.length > 0) logs = logs.concat(page as any[]);
        if (!page || page.length < pageSizeLogs) break;
        fromLogs += pageSizeLogs;
      }

      // Agregar kills/deaths a partir dos logs (mesma lógica do Confrontos Diretos)
      type Stat = { kills: number; deaths: number; displayName: string; matches: Set<string> };
      const playerMap = new Map<string, Stat>();
      const perMatchKills = new Map<string, number>(); // key: `${match_id}|${normKey}`
      const uniqueMatches = new Set<string>();

      for (const log of logs) {
        const matchId = log.match_id as string;
        if (matchId) uniqueMatches.add(matchId);

        const killerDisplay = (log.killer_name || '').trim();
        const victimDisplay = (log.victim_name || '').trim();
        const killerKey = normalize(killerDisplay);
        const victimKey = normalize(victimDisplay);

        if (killerKey) {
          const kstats = playerMap.get(killerKey) || { kills: 0, deaths: 0, displayName: killerDisplay, matches: new Set<string>() };
          kstats.kills += 1;
          if (matchId) kstats.matches.add(matchId);
          playerMap.set(killerKey, kstats);

          if (matchId) {
            const pmkKey = `${matchId}|${killerKey}`;
            perMatchKills.set(pmkKey, (perMatchKills.get(pmkKey) || 0) + 1);
          }
        }
        if (victimKey) {
          const vstats = playerMap.get(victimKey) || { kills: 0, deaths: 0, displayName: victimDisplay, matches: new Set<string>() };
          vstats.deaths += 1;
          if (matchId) vstats.matches.add(matchId);
          playerMap.set(victimKey, vstats);
        }
      }

      // Cone monodedo = jogador com pior pontuação (calculado após agregar)
      let coneMonodedoName = '';

      const totalBossEvents = uniqueMatches.size;

      // Filtrar personagens sem atividade se houver filtros de data/hora
      let aggregated: AggregatedPlayer[] = Array.from(playerMap.entries()).map(([normKey, stats]) => {
        const kda = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
        const weightedKda = totalBossEvents > 0 ? kda * (stats.matches.size / totalBossEvents) : 0;
        const mvpScore = (stats.kills * 3) + (kda * 2) - (stats.deaths * 1.5);
        const eventScore = (stats.kills * 3) + (kda * 2) - (stats.deaths * 1.5);
        const charData = characterMap.get(normKey) || findClosestCharacterData(normKey);
        return {
          name: stats.displayName,
          class: charData.class,
          guild: charData.guild,
          kills: stats.kills,
          deaths: stats.deaths,
          kda,
          weightedKda,
          matches: stats.matches.size,
          mvpScore,
          eventScore,
        };
      });

      // Se houver filtros de data/hora ativos, remove jogadores sem atividade
      if (matchFilterActive) {
        aggregated = aggregated.filter(p => p.kills > 0 || p.deaths > 0);
      }

      // Encontrar o Cone Monodedo = jogador com menor pontuação (eventScore)
      if (aggregated.length > 0) {
        const worstPlayer = [...aggregated].sort((a, b) => a.eventScore - b.eventScore)[0];
        coneMonodedoName = worstPlayer.name;
      }

      // Brabíssimo = maior nº de kills em uma única partida (exclui cone monodedo)
      let brabissimoRecord: { name: string; kills: number } | undefined = undefined;
      for (const [key, count] of perMatchKills.entries()) {
        const [matchId, normKey] = key.split('|');
        const stats = playerMap.get(normKey);
        if (!stats) continue;
        if (stats.displayName === coneMonodedoName) continue;
        if (!brabissimoRecord || count > brabissimoRecord.kills) {
          brabissimoRecord = { name: stats.displayName, kills: count };
        }
      }

      // Remove debug logs in production

      const dedupCharacters = Array.from(characterMap.entries()).map(([norm, data]) => {
        const original = (entries.find(e => e.norm === norm)?.displayName) || '';
        return { name: original, class: data.class || null, guild: data.guild || null };
      });

      return { aggregated, brabissimoRecord, coneMonodedoName, characters: dedupCharacters };
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

      // Só adiciona jogadores cadastrados sem partidas se NÃO houver filtros de data/hora
      const hasDateFilters = !!(debouncedDateFrom || debouncedDateTo || debouncedHourFrom !== undefined || debouncedHourTo !== undefined);
      if (!hasDateFilters) {
        const existing = new Set(filtered.map(p => normalizeNameKey(p.name)));
        const toAdd =
          (aggregatedData as any)?.characters
            ?.filter((c: any) => normalizeClassKey(c.class || '') === classFilter)
            ?.filter((c: any) => !existing.has(normalizeNameKey(c.name)))
            ?.map((c: any) => ({
              name: c.name,
              class: c.class || null,
              guild: c.guild || null,
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
    }
    
    return [...filtered].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [aggregatedData, sortBy, classFilter, debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo]);

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
      ['Rank', 'Jogador', 'Classe', 'Guild', 'Kills', 'Deaths', 'KDA', 'Pontuação', 'Boss'],
      ...sortedPlayers.map((player, index) => [
        index + 1,
        player.name,
        player.class || '-',
        player.guild || '-',
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

      const payload = {
        environment,
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
        },
        guildSummary: (() => {
          const guildCounts = sortedPlayers.reduce((acc, player) => {
            const guild = player.guild || 'Sem Guild';
            acc[guild] = (acc[guild] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          return guildCounts;
        })()
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
                <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase tracking-wider">
                  Guild
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
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">
                        {player.guild || '-'}
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

      {/* Resumo por Guild */}
      <div className="bg-card/50 p-6 rounded-xl border border-border">
        <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-warning" />
          Resumo por Guild
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(() => {
            const guildCounts = sortedPlayers.reduce((acc, player) => {
              const guild = player.guild || 'Sem Guild';
              acc[guild] = (acc[guild] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            return Object.entries(guildCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([guild, count]) => (
                <div
                  key={guild}
                  className="bg-secondary/30 border border-border/50 rounded-lg p-4 text-center hover:bg-secondary/50 transition-colors"
                >
                  <p className="text-sm font-semibold text-muted-foreground mb-1">{guild}</p>
                  <p className="text-2xl font-bold text-primary">{count}</p>
                  <p className="text-xs text-muted-foreground">
                    {count === 1 ? 'jogador' : 'jogadores'}
                  </p>
                </div>
              ));
          })()}
        </div>
      </div>
    </div>
  );
};
