
# Plano: Pausar postagem automática no Discord

## O que será feito
Adicionar uma flag de controle (`AUTO_POST_PAUSED`) na edge function `auto-process-ranking` que, quando ativada, impede o envio ao Discord mas **mantém o processamento e salvamento dos dados normalmente**.

## Abordagem técnica
Será criada uma variável de ambiente/secret `AUTO_POST_PAUSED` com valor `true`. Na edge function, antes de postar no Discord (linha ~723), adicionar uma verificação:

```typescript
const isPostingPaused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

if (webhookUrl && !isPostingPaused) {
  // post to Discord...
} else if (isPostingPaused) {
  console.log('[Auto Process] Discord posting is PAUSED');
}
```

## Para reativar
Quando quiser reativar, basta me pedir para remover a flag ou alterar para `false`.

## Arquivos modificados
- `supabase/functions/auto-process-ranking/index.ts` — adicionar check de pausa antes do envio ao Discord
- Secret `AUTO_POST_PAUSED` = `true`
