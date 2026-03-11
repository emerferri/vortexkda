import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Users, Shield, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'moderator';
  email?: string;
}

export const UserManagement = () => {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'moderator' as 'admin' | 'moderator',
  });

  useEffect(() => {
    loadUserRoles();
  }, []);

  const loadUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, role')
        .order('role');

      if (error) throw error;

      // For each user role, we'll show the user_id since we can't access auth.users
      const rolesWithInfo = (data || []).map(ur => ({
        ...ur,
        role: ur.role as 'admin' | 'moderator',
        email: `User ID: ${ur.user_id.slice(0, 8)}...`,
      }));

      setUserRoles(rolesWithInfo);
    } catch (error) {
      console.error('Error loading user roles:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar usuários',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Save admin session before creating user
      const { data: adminSession } = await supabase.auth.getSession();
      const adminRefreshToken = adminSession?.session?.refresh_token;

      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Falha ao criar usuário');

      const newUserId = authData.user.id;

      // Restore admin session before assigning role
      if (adminRefreshToken) {
        await supabase.auth.refreshSession({ refresh_token: adminRefreshToken });
      }

      // Assign role using security definer function
      const { error: roleError } = await supabase.rpc('assign_user_role', {
        _user_id: newUserId,
        _role: formData.role,
      });

      if (roleError) throw roleError;

      toast({
        title: 'Sucesso',
        description: `Usuário ${formData.email} criado como ${formData.role}!`,
      });

      setDialogOpen(false);
      setFormData({ email: '', password: '', role: 'moderator' });
      loadUserRoles();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao criar usuário',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário do sistema?')) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Permissão removida com sucesso!',
      });
      loadUserRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao remover permissão',
        variant: 'destructive',
      });
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') {
      return (
        <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
          <ShieldCheck className="w-3 h-3 mr-1" />
          Admin
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">
        <Shield className="w-3 h-3 mr-1" />
        Moderador
      </Badge>
    );
  };

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
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary" />
          <div>
            <CardTitle>Gestão de Usuários</CardTitle>
            <CardDescription>
              Cadastre novos usuários e atribua suas funções no sistema
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateUser}>
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Crie uma conta e atribua a função do usuário no sistema
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: 'admin' | 'moderator') => setFormData({ ...formData, role: value })}
                    disabled={submitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moderator">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-500" />
                          Moderador
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-red-500" />
                          Administrador
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <strong>Moderador:</strong> Pode incluir e editar dados, mas não pode acessar o painel Admin ou deletar registros.
                    <br />
                    <strong>Admin:</strong> Acesso total ao sistema.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Usuário'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identificador</TableHead>
                <TableHead>Função</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userRoles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Nenhum usuário com permissões especiais cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                userRoles.map((userRole) => (
                  <TableRow key={userRole.id}>
                    <TableCell className="font-mono text-sm">{userRole.email}</TableCell>
                    <TableCell>{getRoleBadge(userRole.role)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRole(userRole.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <h4 className="font-semibold mb-2">Permissões por Função:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-blue-500 flex items-center gap-1 mb-1">
                <Shield className="w-4 h-4" /> Moderador
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Visualizar todos os rankings</li>
                <li>Incluir novos dados (partidas)</li>
                <li>Adicionar e editar personagens</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-red-500 flex items-center gap-1 mb-1">
                <ShieldCheck className="w-4 h-4" /> Administrador
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Todas as permissões do Moderador</li>
                <li>Deletar personagens e dados</li>
                <li>Acessar painel Admin completo</li>
                <li>Gerenciar webhooks e usuários</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
