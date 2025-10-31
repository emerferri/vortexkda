import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Trash2, Pencil, Filter, FilterX } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'react-router-dom';

interface Character {
  id: string;
  name: string;
  guild: string;
  class: string;
}

export const Characters = () => {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [formData, setFormData] = useState({ name: '', guild: '', class: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showUnregisteredOnly, setShowUnregisteredOnly] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    loadCharacters();
    // Check if we should show unregistered only
    if (searchParams.get('filter') === 'unregistered') {
      setShowUnregisteredOnly(true);
    }
  }, [searchParams]);

  const loadCharacters = async () => {
    try {
      // Get all registered characters (explicit columns to avoid reserved-word issues)
      const { data: registeredChars, error: charsError } = await supabase
        .from('characters')
        .select('id, name, guild, class')
        .order('name');

      if (charsError) throw charsError;
      console.log('[Characters] registeredChars count:', registeredChars?.length ?? 0);

      // Get all unique player names from matches
      const { data: matchPlayers, error: matchError } = await supabase
        .from('pvp_match_players')
        .select('player_name');

      if (matchError) throw matchError;

      // Strong normalization function (NFKC + collapse spaces + trim + lowercase)
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      // Build a map of normalized names -> display names from match players
      const playersByNorm = new Map<string, string>();
      for (const p of matchPlayers || []) {
        const display = (p.player_name || '').replace(/\s+/g, ' ').trim();
        const key = normalize(display);
        if (key) playersByNorm.set(key, display);
      }
      console.log('[Characters] matchPlayers unique (normalized) count:', playersByNorm.size);
      console.log('[Characters] matchPlayers sample (first 20):', Array.from(playersByNorm.values()).slice(0, 20));

      // Build a set of normalized registered character names
      const registeredNorm = new Set((registeredChars || []).map(c => normalize(c.name)));
      console.log('[Characters] registeredNorm count:', registeredNorm.size);
      console.log('[Characters] registeredNorm sample (first 20):', Array.from(registeredNorm).slice(0, 20));

      // Find unregistered players (present in matches but not in characters)
      const unregisteredPlayers = [...playersByNorm.entries()]
        .filter(([key]) => !registeredNorm.has(key))
        .map(([_, display]) => ({
          id: `unregistered-${display}`,
          name: display,
          guild: '',
          class: '',
        }));
      console.log('[Characters] unregistered count:', unregisteredPlayers.length);
      console.log('[Characters] unregistered sample (first 20):', unregisteredPlayers.map(u => u.name).slice(0, 20));

      // Combine registered and unregistered, sort by name
      const allCharacters = [ ...(registeredChars || []), ...unregisteredPlayers ]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      console.log('[Characters] final counts => registered:', registeredChars?.length ?? 0, 'unregistered:', unregisteredPlayers.length, 'total:', allCharacters.length);
      setCharacters(allCharacters);
    } catch (error) {
      console.error('Error loading characters:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar personagens',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingCharacter && !editingCharacter.id.startsWith('unregistered-')) {
        const { error } = await supabase
          .from('characters')
          .update(formData)
          .eq('id', editingCharacter.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Personagem atualizado!' });
      } else {
        const { error } = await supabase
          .from('characters')
          .insert([formData]);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Personagem adicionado!' });
      }

      setDialogOpen(false);
      setFormData({ name: '', guild: '', class: '' });
      setEditingCharacter(null);
      loadCharacters();
    } catch (error: any) {
      console.error('Error saving character:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar personagem',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    // Cannot delete unregistered characters
    if (id.startsWith('unregistered-')) {
      toast({
        title: 'Aviso',
        description: 'Não é possível excluir um personagem não cadastrado',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este personagem?')) return;

    try {
      const { error } = await supabase
        .from('characters')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Personagem excluído!' });
      loadCharacters();
    } catch (error) {
      console.error('Error deleting character:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao excluir personagem',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (character: Character) => {
    setEditingCharacter(character);
    setFormData({ name: character.name, guild: character.guild, class: character.class });
    setDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCharacter(null);
    setFormData({ name: '', guild: '', class: '' });
    setDialogOpen(true);
  };

  // Helper to normalize strings (for checking special values)
  const normalize = (s?: string) =>
    (s ?? '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  // Check if a value looks like "sem guild" placeholder (ignore case/accents/spaces)
  const isSemGuild = (val?: string) => {
    const normalized = normalize(val).replace(/[^a-z]/g, '');
    return normalized === 'semguild';
  };

  // Check if a value is missing (empty, null, '-', 'n/a', 'none', but NOT "sem guild")
  const isValueMissing = (val?: string) => {
    if (isSemGuild(val)) return false; // "sem guild" is not considered missing
    const v = normalize(val);
    return !v || v === '-' || v === 'n/a' || v === 'none';
  };

  // A character is incomplete if it's unregistered OR both guild and class are missing
  const isIncomplete = (c: Character) =>
    c.id.startsWith('unregistered-') || (isValueMissing(c.guild) && isValueMissing(c.class));

  const unregisteredCount = characters.filter(isIncomplete).length;

  const normalizedSearch = searchTerm.toLowerCase();
  const filteredCharacters = characters.filter((char) => {
    const nameMatch = (char.name ?? '').toLowerCase().includes(normalizedSearch);
    const guildMatch = (char.guild ?? '').toLowerCase().includes(normalizedSearch);
    const classMatch = (char.class ?? '').toLowerCase().includes(normalizedSearch);
    const matchesSearch = nameMatch || guildMatch || classMatch;

    const isUnregistered = isIncomplete(char);
    const matchesFilter = showUnregisteredOnly ? isUnregistered : true;

    return matchesSearch && matchesFilter;
  });


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Personagens Cadastrados</CardTitle>
            <CardDescription>
              Total de {characters.length} personagens ({unregisteredCount} não cadastrados)
            </CardDescription>
          </div>
          {unregisteredCount > 0 && (
            <Badge variant="secondary" className="text-yellow-600 border-yellow-600">
              {unregisteredCount} sem cadastro completo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, guild ou classe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              aria-label="Buscar por nome, guild ou classe"
            />
          </div>
          <Button
            variant={showUnregisteredOnly ? "default" : "outline"}
            onClick={() => setShowUnregisteredOnly(!showUnregisteredOnly)}
            className="gap-2"
            aria-pressed={showUnregisteredOnly}
          >
            {showUnregisteredOnly ? (
              <>
                <FilterX className="w-4 h-4" />
                Mostrar Todos
              </>
            ) : (
              <>
                <Filter className="w-4 h-4" />
                Apenas Não Cadastrados
              </>
            )}
          </Button>
          {user && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAddDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>
                      {editingCharacter ? 'Editar Personagem' : 'Novo Personagem'}
                    </DialogTitle>
                    <DialogDescription>
                      Preencha os dados do personagem
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome do Assassino</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guild">Guild</Label>
                      <Input
                        id="guild"
                        value={formData.guild}
                        onChange={(e) => setFormData({ ...formData, guild: e.target.value })}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="class">Classe</Label>
                      <Input
                        id="class"
                        value={formData.class}
                        onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                        required
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assassino</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead>Classe</TableHead>
                {user && <TableHead className="w-[100px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCharacters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={user ? 4 : 3} className="text-center text-muted-foreground">
                    Nenhum personagem encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredCharacters.map((character) => (
                  <TableRow key={character.id}>
                    <TableCell className="font-medium">
                      {character.name}
                      {isIncomplete(character) && (
                        <span className="ml-2 text-xs text-yellow-600 font-semibold">
                          (Cadastro incompleto)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{character.guild || '-'}</TableCell>
                    <TableCell>{character.class || '-'}</TableCell>
                    {user && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(character)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(character.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
