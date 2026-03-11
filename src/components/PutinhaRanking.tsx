import { useState, useRef, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Target, Download, Calendar, Clock } from 'lucide-react';
import { EventTypeFilter } from './EventTypeFilter';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PutinhaRelation {
  victim: string;
  killer: string;
  deaths: number;
  victimGuild?: string;
  killerGuild?: string;
}

export const PutinhaRanking = () => {
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [hourFrom, setHourFrom] = useState<number>();
  const [hourTo, setHourTo] = useState<number>();
  const [debouncedDateFrom, setDebouncedDateFrom] = useState<Date>();
  const [debouncedDateTo, setDebouncedDateTo] = useState<Date>();
  const [debouncedHourFrom, setDebouncedHourFrom] = useState<number>();
  const [debouncedHourTo, setDebouncedHourTo] = useState<number>();
  const cardRef = useRef<HTMLDivElement>(null);

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

  const { data: relations = [], isLoading: loading } = useQuery({
    queryKey: ['putinha-ranking', debouncedDateFrom, debouncedDateTo, debouncedHourFrom, debouncedHourTo],
    staleTime: 30000,
    queryFn: async () => {

      // 1) Fetch match IDs based on date/hour filters
      let matchQuery = supabase.from('pvp_matches').select('id');

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
      if (matchIds.length === 0) {
        return [];
      }

      // 2) Fetch kill logs filtered by match IDs with pagination
      const pageSize = 1000;
      let from = 0;
      let allKillLogs: { killer_name: string; victim_name: string }[] = [];

      while (true) {
        const { data, error } = await supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name, match_id')
          .in('match_id', matchIds)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) allKillLogs = allKillLogs.concat(data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // 3) Fetch character guild info
      const { data: characters, error: charsError } = await supabase
        .from('characters')
        .select('name, guild');

      if (charsError) throw charsError;

      const characterMap = new Map(
        (characters || []).map((c) => [c.name, c.guild])
      );

      // 4) Count deaths per exact killer->victim pair
      const deathCount = new Map<string, { killer: string; victim: string; count: number }>();

      for (const log of allKillLogs) {
        const key = `${log.victim_name}->${log.killer_name}`;
        const existing = deathCount.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          deathCount.set(key, {
            victim: log.victim_name,
            killer: log.killer_name,
            count: 1,
          });
        }
      }

      // 5) Filter out mutual domination (both are putinhas of each other)
      const filteredRelations = Array.from(deathCount.values()).filter((r) => {
        if (r.count < 10) return false;
        
        // Check if reverse relation also exists with 10+ deaths
        const reverseKey = `${r.killer}->${r.victim}`;
        const reverseRelation = deathCount.get(reverseKey);
        
        // If both kill each other 10+ times, exclude this relation
        if (reverseRelation && reverseRelation.count >= 10) {
          return false;
        }
        
        return true;
      });

      // 6) Map to final format and sort by deaths
      // Pre-compute total kills per killer for sorting
      const killerTotals = new Map<string, number>();
      for (const r of filteredRelations) {
        killerTotals.set(r.killer, (killerTotals.get(r.killer) || 0) + r.count);
      }

      const putinhaRelations: PutinhaRelation[] = filteredRelations
        .map((r) => ({
          victim: r.victim,
          killer: r.killer,
          deaths: r.count,
          victimGuild: characterMap.get(r.victim),
          killerGuild: characterMap.get(r.killer),
        }))
        .sort((a, b) => {
          if (a.killer !== b.killer) {
            return (killerTotals.get(b.killer) || 0) - (killerTotals.get(a.killer) || 0);
          }
          return b.deaths - a.deaths;
        });

      return putinhaRelations;
    }
  });

  const exportAsImage = async () => {
    if (!cardRef.current) return;

    try {
      setExporting(true);
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#1a1a1a',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `minha-putinha-ranking-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      toast({
        title: 'Sucesso',
        description: 'Imagem exportada com sucesso!',
      });
    } catch (error) {
      console.error('Error exporting image:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao exportar imagem',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skull className="w-6 h-6 text-destructive" />
            <div>
              <CardTitle>Ranking: Minha Putinha</CardTitle>
              <CardDescription>
                Quem morre 10 ou mais vezes para o mesmo jogador (Total: {relations.length} relações)
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={exportAsImage}
            disabled={exporting || relations.length === 0}
            variant="outline"
            size="sm"
          >
            <Download className="w-4 h-4" />
            Exportar
          </Button>
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
              <CalendarComponent
                mode="single"
                selected={dateFrom}
                onSelect={setDateFrom}
                initialFocus
              />
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
              <CalendarComponent
                mode="single"
                selected={dateTo}
                onSelect={setDateTo}
                initialFocus
              />
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
                <SelectItem key={i} value={i.toString()}>
                  {i}:00
                </SelectItem>
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
                <SelectItem key={i} value={i.toString()}>
                  {i}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(dateFrom || dateTo || hourFrom !== undefined || hourTo !== undefined) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom(undefined);
                setDateTo(undefined);
                setHourFrom(undefined);
                setHourTo(undefined);
              }}
            >
              Limpar Filtros
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {relations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma relação de dominância encontrada ainda.</p>
            <p className="text-sm mt-2">É necessário morrer 10 ou mais vezes para o mesmo jogador.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Dominador</TableHead>
                  <TableHead className="text-center w-24">Kills</TableHead>
                  <TableHead>Putinha</TableHead>
                  <TableHead className="text-center">Nível</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relations.map((relation, index) => {
                  const dominanceLevel = 
                    relation.deaths >= 50 ? 'DEVASTADOR' :
                    relation.deaths >= 30 ? 'CRUEL' :
                    relation.deaths >= 20 ? 'IMPLACÁVEL' :
                    'DOMINANTE';
                  
                  const badgeVariant = 
                    relation.deaths >= 50 ? 'destructive' :
                    relation.deaths >= 30 ? 'destructive' :
                    relation.deaths >= 20 ? 'default' :
                    'secondary';

                  return (
                    <TableRow key={`${relation.victim}-${relation.killer}`}>
                      <TableCell className="font-bold text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium">{relation.killer}</div>
                            {relation.killerGuild && (
                              <div className="text-xs text-muted-foreground">
                                {relation.killerGuild}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-bold text-destructive border-destructive">
                          {relation.deaths}×
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skull className="w-4 h-4 text-destructive" />
                          <div>
                            <div className="font-medium">{relation.victim}</div>
                            {relation.victimGuild && (
                              <div className="text-xs text-muted-foreground">
                                {relation.victimGuild}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badgeVariant} className="font-semibold">
                          {dominanceLevel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
