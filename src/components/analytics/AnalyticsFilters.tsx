import { useState, useEffect } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnalyticsFilters as FiltersType, defaultFilters } from '@/hooks/useAnalyticsData';
import { supabase } from '@/integrations/supabase/client';

interface AnalyticsFiltersProps {
  filters: FiltersType;
  onChange: (filters: FiltersType) => void;
}

const hours = Array.from({ length: 24 }, (_, i) => i);

// Parse dd/mm/yyyy input to yyyy-mm-dd
function parseInputDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = parseInt(day), m = parseInt(month), y = parseInt(year);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  return `${year}-${month}-${day}`;
}

// Format yyyy-mm-dd to dd/mm/yyyy for display
function formatForDisplay(isoDate: string | null): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export const AnalyticsFiltersBar = ({ filters, onChange }: AnalyticsFiltersProps) => {
  const [guilds, setGuilds] = useState<string[]>([]);
  const [dateFromInput, setDateFromInput] = useState(formatForDisplay(filters.dateFrom));
  const [dateToInput, setDateToInput] = useState(formatForDisplay(filters.dateTo));

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

  // Sync inputs when filters change externally (e.g. reset)
  useEffect(() => {
    setDateFromInput(formatForDisplay(filters.dateFrom));
  }, [filters.dateFrom]);

  useEffect(() => {
    setDateToInput(formatForDisplay(filters.dateTo));
  }, [filters.dateTo]);

  const handleDateFromBlur = () => {
    if (dateFromInput === '') {
      onChange({ ...filters, dateFrom: null });
      return;
    }
    const parsed = parseInputDate(dateFromInput);
    if (parsed) {
      onChange({ ...filters, dateFrom: parsed });
    } else {
      // revert to current filter value
      setDateFromInput(formatForDisplay(filters.dateFrom));
    }
  };

  const handleDateToBlur = () => {
    if (dateToInput === '') {
      onChange({ ...filters, dateTo: null });
      return;
    }
    const parsed = parseInputDate(dateToInput);
    if (parsed) {
      onChange({ ...filters, dateTo: parsed });
    } else {
      setDateToInput(formatForDisplay(filters.dateTo));
    }
  };

  const handleDateKeyDown = (e: React.KeyboardEvent, type: 'from' | 'to') => {
    if (e.key === 'Enter') {
      type === 'from' ? handleDateFromBlur() : handleDateToBlur();
    }
  };

  const reset = () => onChange({ ...defaultFilters });

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card/50 rounded-lg border border-border">
      <Filter className="w-4 h-4 text-muted-foreground" />

      {/* Date From */}
      <Input
        placeholder="Data início (dd/mm/aaaa)"
        value={dateFromInput}
        onChange={(e) => setDateFromInput(e.target.value)}
        onBlur={handleDateFromBlur}
        onKeyDown={(e) => handleDateKeyDown(e, 'from')}
        className="w-[170px] h-8 text-xs"
      />

      {/* Date To */}
      <Input
        placeholder="Data fim (dd/mm/aaaa)"
        value={dateToInput}
        onChange={(e) => setDateToInput(e.target.value)}
        onBlur={handleDateToBlur}
        onKeyDown={(e) => handleDateKeyDown(e, 'to')}
        className="w-[170px] h-8 text-xs"
      />

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
          <SelectItem value="arka_war">Arka War</SelectItem>
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
