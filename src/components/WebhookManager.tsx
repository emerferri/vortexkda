import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Webhook, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export const WebhookManager = () => {
  const [webhookHomolog, setWebhookHomolog] = useState('');
  const [webhookProd, setWebhookProd] = useState('');
  const [showHomolog, setShowHomolog] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOpenBackend = () => {
    toast.info('Você será redirecionado para a área de Secrets do backend.');
  };

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Webhook className="w-8 h-8 text-primary" />
          <div>
            <CardTitle className="text-2xl">Configuração de Webhooks Discord</CardTitle>
            <CardDescription className="text-base mt-1">
              Configure os webhooks para homologação e produção
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Webhook Homologação */}
          <div className="space-y-3">
            <Label htmlFor="webhook-homolog" className="text-base font-semibold flex items-center gap-2">
              🧪 Webhook de Homologação (Testes)
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="webhook-homolog"
                  type={showHomolog ? 'text' : 'password'}
                  value={webhookHomolog}
                  onChange={(e) => setWebhookHomolog(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowHomolog(!showHomolog)}
                >
                  {showHomolog ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Este webhook será usado quando selecionar "Homologação" ao publicar rankings
            </p>
          </div>

          {/* Webhook Produção */}
          <div className="space-y-3">
            <Label htmlFor="webhook-prod" className="text-base font-semibold flex items-center gap-2">
              🚀 Webhook de Produção (Oficial)
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="webhook-prod"
                  type={showProd ? 'text' : 'password'}
                  value={webhookProd}
                  onChange={(e) => setWebhookProd(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowProd(!showProd)}
                >
                  {showProd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Este webhook será usado quando selecionar "Produção" ao publicar rankings
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-semibold mb-3">ℹ️ Como configurar os webhooks:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground mb-4">
              <li>Clique no botão "Configurar Secrets" abaixo para abrir o backend</li>
              <li>Na área de Secrets, adicione ou atualize:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li><code className="text-xs bg-background px-1 py-0.5 rounded">DISCORD_WEBHOOK_URL</code> (para homologação)</li>
                  <li><code className="text-xs bg-background px-1 py-0.5 rounded">DISCORD_WEBHOOK_URL_PROD</code> (para produção)</li>
                </ul>
              </li>
              <li>Cole os URLs dos webhooks do Discord diretamente nos secrets</li>
              <li>Ao publicar um ranking, selecione o ambiente desejado</li>
              <li>O edge function usará automaticamente o webhook correto de forma segura</li>
            </ol>
            
            <Button 
              onClick={handleOpenBackend}
              className="w-full gap-2"
              variant="default"
            >
              <Save className="w-4 h-4" />
              Configurar Secrets no Backend
            </Button>
            
            <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                ⚠️ Por segurança, os webhooks são armazenados apenas no backend e não no navegador.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
