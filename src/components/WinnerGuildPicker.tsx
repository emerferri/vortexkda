import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trophy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';

interface Props {
  matchIds: string[];
  guilds: string[];
  onWinnerChange?: (winner: string | null) => void;
}

export const WinnerGuildPicker = ({ matchIds, guilds, onWinnerChange }: Props) => {
  const { isAdmin } = useUserRole();
  const canEdit = isAdmin;
  const [current, setCurrent] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('__none__');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const guildOptions = useMemo(
    () => Array.from(new Set(guilds.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [guilds]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!matchIds.length) {
        setCurrent(null);
        setSelected('__none__');
        onWinnerChange?.(null);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('pvp_matches')
        .select('winner_guild')
        .in('id', matchIds);
      setLoading(false);
      if (cancelled) return;
      if (error) {
        console.error('winner load error', error);
        return;
      }
      const winners = (data || []).map((r: any) => r.winner_guild).filter(Boolean);
      const uniq = Array.from(new Set(winners));
      const winner = uniq.length === 1 ? uniq[0] : null;
      setCurrent(winner);
      setSelected(winner || '__none__');
      onWinnerChange?.(winner);
    };
    load();
    return () => { cancelled = true; };
  }, [matchIds.join(',')]);

  const handleSave = async () => {
    if (!matchIds.length) return;
    setSaving(true);
    const value = selected === '__none__' ? null : selected;
    const { error } = await supabase
      .from('pvp_matches')
      .update({ winner_guild: value })
      .in('id', matchIds);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setCurrent(value);
    onWinnerChange?.(value);
    toast({ title: 'Guild vencedora atualizada', description: value ? `Vencedora: ${value}` : 'Removida' });
  };

  if (!matchIds.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-warning/40 bg-warning/5">
      <Trophy className="w-4 h-4 text-warning" />
      <span className="text-sm font-semibold">Guild Vencedora:</span>
      {canEdit ? (
        <>
          <Select value={selected} onValueChange={setSelected} disabled={loading || saving}>
            <SelectTrigger className="w-[220px] h-8">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Nenhuma —</SelectItem>
              {guildOptions.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleSave} disabled={saving || loading || selected === (current || '__none__')}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
          </Button>
        </>
      ) : (
        <span className="text-sm">{current || '—'}</span>
      )}
      {current && canEdit && (
        <span className="text-xs text-muted-foreground ml-2">Atual: <strong>{current}</strong></span>
      )}
    </div>
  );
};
