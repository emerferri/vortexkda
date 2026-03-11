import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AnalyticsFilters as FiltersType, defaultFilters } from '@/hooks/useAnalyticsData';
import { supabase } from '@/integrations/supabase/client';

interface AnalyticsFiltersProps {
  filters: FiltersType;
  onChange: (filters: FiltersType) => void;
}

const hours = Array.from({ length: 24 }, (_, i) => i);

export const AnalyticsFiltersBar = ({ filters, onChange }: AnalyticsFiltersProps) => {
  const [guilds, setGuilds] = useState<string[]>([]);

  useEffect(() => {
    const fetchGuilds = async () => {
      const { data } = await supabase
        .from('characters')
        .select('guild')
        .eq('banned', false);
      if (data) {
        const unique = [...new Set(data.map(c => c.guild).filter(Boolean))].sort();
        setGuilds(unique);
      }
    };
    fetchGuilds();
  }, []);

  const handleDateFrom = (date: Date | undefined) => {
    onChange({ ...filters, dateFrom: date ? format(date, 'yyyy-MM-dd') : null });
  };

  const handleDateTo = (date: Date | undefined) => {
    onChange({ ...filters, dateTo: date ? format(date, 'yyyy-MM-dd') : null });
  };

  const reset = () => onChange({ ...defaultFilters });

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card/50 rounded-lg border border-border">
      <Filter className="w-4 h-4 text-muted-foreground" />

      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-2 text-xs", !filters.dateFrom && "text-muted-foreground")}>
            <CalendarIcon className="w-3 h-3" />
            {filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy') : 'Data início'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
            onSelect={handleDateFrom}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Date To */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("gap-2 text-xs", !filters.dateTo && "text-muted-foreground")}>
            <CalendarIcon className="w-3 h-3" />
            {filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy') : 'Data fim'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
            onSelect={handleDateTo}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Hour From */}
      <Select
        value={filters.hourFrom !== null ? String(filters.hourFrom) : 'all'}
        onValueChange={(v) => onChange({ ...filters, hourFrom: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Hora início" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Hora início</SelectItem>
          {hours.map(h => (
            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Hour To */}
      <Select
        value={filters.hourTo !== null ? String(filters.hourTo) : 'all'}
        onValueChange={(v) => onChange({ ...filters, hourTo: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger className="w-[100px] h-8 text-xs">
          <SelectValue placeholder="Hora fim" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Hora fim</SelectItem>
          {hours.map(h => (
            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Event Type */}
      <Select
        value={filters.eventType}
        onValueChange={(v) => onChange({ ...filters, eventType: v as FiltersType['eventType'] })}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos Eventos</SelectItem>
          <SelectItem value="boss_event">Boss Event</SelectItem>
          <SelectItem value="throne_conquest">Throne</SelectItem>
        </SelectContent>
      </Select>

      {/* Guild */}
      <Select
        value={filters.guild || 'all'}
        onValueChange={(v) => onChange({ ...filters, guild: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Guild" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas Guilds</SelectItem>
          {guilds.map(g => (
            <SelectItem key={g} value={g}>{g}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-xs text-muted-foreground">
        <RotateCcw className="w-3 h-3" /> Limpar
      </Button>
    </div>
  );
};
