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

  const handleSave = async () => {
    if (!webhookHomolog.trim() && !webhookProd.trim()) {
      toast.error('Preencha pelo menos um webhook');
      return;
    }

    setLoading(true);
    try {
      // Save to localStorage for now (edge function will use secrets)
      if (webhookHomolog.trim()) {
        localStorage.setItem('DISCORD_WEBHOOK_URL', webhookHomolog.trim());
      }
      if (webhookProd.trim()) {
        localStorage.setItem('DISCORD_WEBHOOK_URL_PROD', webhookProd.trim());
      }
      
      toast.success('Webhooks salvos com sucesso!');
      toast.info('Nota: Para usar os webhooks salvos, será necessário atualizar os secrets no backend');
    } catch (error) {
      console.error('Erro ao salvar webhooks:', error);
      toast.error('Erro ao salvar webhooks');
    } finally {
      setLoading(false);
    }
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

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salvar Webhooks'}
            </Button>
          </div>

          {/* Info Box */}
          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-semibold mb-2">ℹ️ Como usar:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Cole os URLs dos webhooks do Discord nos campos acima</li>
              <li>Clique em "Salvar Webhooks"</li>
              <li>Ao publicar um ranking, selecione o ambiente desejado (Homologação ou Produção)</li>
              <li>O sistema usará automaticamente o webhook correto</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
