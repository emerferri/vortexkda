import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WebhookManager } from './WebhookManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfrontosDiretos } from './ConfrontosDiretos';
import { Characters } from './Characters';

export const DatabaseManager = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('management');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab === 'personagens') {
      setActiveTab('personagens');
    }
  }, [searchParams]);

  const clearAllPvpData = async () => {
    if (!user) {
      toast.error('Você precisa estar logado para executar esta ação');
      navigate('/auth');
      return;
    }

    try {
      setLoading(true);

      // Deletar kill logs primeiro (devido à foreign key)
      const { error: killLogsError } = await supabase
        .from('pvp_kill_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (killLogsError) throw killLogsError;

      // Deletar match players
      const { error: playersError } = await supabase
        .from('pvp_match_players')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (playersError) throw playersError;

      // Deletar matches
      const { error: matchesError } = await supabase
        .from('pvp_matches')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (matchesError) throw matchesError;

      toast.success('Todos os dados de PVP foram removidos com sucesso!');
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      toast.error('Erro ao limpar dados do banco');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-6">
        <TabsTrigger value="management">Gerenciamento</TabsTrigger>
        <TabsTrigger value="confrontos">Confrontos Diretos</TabsTrigger>
        <TabsTrigger value="personagens">Personagens</TabsTrigger>
      </TabsList>

      <TabsContent value="management">
        <div className="space-y-6">
          {/* Webhook Manager */}
          <WebhookManager />

          {/* Database Manager */}
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-destructive" />
                <div>
                  <CardTitle className="text-2xl">Gerenciamento de Banco de Dados</CardTitle>
                  <CardDescription className="text-base mt-1">
                    Ferramentas administrativas para gerenciar dados do sistema
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-destructive mb-2">Limpar Todos os Dados de PVP</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Esta ação irá remover permanentemente todas as partidas, estatísticas de jogadores e registros de confrontos diretos.
                        Use esta opção se você deseja reimportar todos os dados do zero com os arquivos .txt completos.
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            disabled={loading}
                            className="gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            {loading ? 'Limpando...' : 'Limpar Todos os Dados'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Isso irá remover permanentemente:
                              <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Todas as partidas registradas</li>
                                <li>Todas as estatísticas de jogadores</li>
                                <li>Todos os registros de confrontos diretos (quem matou quem)</li>
                              </ul>
                              <p className="mt-3 font-semibold text-destructive">
                                Você precisará reimportar todos os arquivos .txt novamente.
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={clearAllPvpData}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Sim, limpar tudo
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Instruções para reimportação:</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Clique no botão "Limpar Todos os Dados" acima</li>
                    <li>Confirme a ação no diálogo de confirmação</li>
                    <li>Vá para a aba "Incluir Dados"</li>
                    <li>Importe cada arquivo .txt das partidas novamente</li>
                    <li>Clique em "Salvar no Banco" para cada partida</li>
                    <li>Agora todos os rankings incluirão os dados de confrontos diretos</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="confrontos">
        <ConfrontosDiretos />
      </TabsContent>

      <TabsContent value="personagens">
        <Characters />
      </TabsContent>
    </Tabs>
  );
};
