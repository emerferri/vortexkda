import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Skull, Target, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

interface PutinhaRelation {
  victim: string;
  killer: string;
  deaths: number;
  victimGuild?: string;
  killerGuild?: string;
}

export const PutinhaRanking = () => {
  const [relations, setRelations] = useState<PutinhaRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPutinhaRanking();
  }, []);

  const loadPutinhaRanking = async () => {
    try {
      setLoading(true);

      // 1) Fetch all kill logs with pagination to avoid row caps
      const pageSize = 1000;
      let from = 0;
      let allKillLogs: { killer_name: string; victim_name: string }[] = [];

      while (true) {
        const { data, error } = await supabase
          .from('pvp_kill_logs')
          .select('killer_name, victim_name')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) allKillLogs = allKillLogs.concat(data);
        if (!data || data.length < pageSize) break; // no more pages
        from += pageSize;
      }

      // 2) Fetch character guild info
      const { data: characters, error: charsError } = await supabase
        .from('characters')
        .select('name, guild');

      if (charsError) throw charsError;

      const characterMap = new Map(
        (characters || []).map((c) => [c.name, c.guild])
      );

      // 3) Count deaths per exact killer->victim pair across ALL logs
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

      // 4) Keep only relations with 10 or more deaths and sort desc
      const putinhaRelations: PutinhaRelation[] = Array.from(deathCount.values())
        .filter((r) => r.count >= 10)
        .map((r) => ({
          victim: r.victim,
          killer: r.killer,
          deaths: r.count,
          victimGuild: characterMap.get(r.victim),
          killerGuild: characterMap.get(r.killer),
        }))
        .sort((a, b) => b.deaths - a.deaths);

      setRelations(putinhaRelations);
    } catch (error) {
      console.error('Error loading putinha ranking:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar ranking',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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
