
# Plano: Frases Dinamicas + Throne no Monitoramento

## Parte 1: Tabela de Frases Dinamicas

### Nova tabela `discord_highlight_phrases`

Criar a tabela com as colunas:
- `id` (uuid, PK)
- `category` (text): `kill_streak`, `best_kda`, `cone`
- `phrase_template` (text): template com placeholders `{name}` e `{value}`
- `created_at` (timestamptz)

RLS: leitura publica, escrita apenas admin.

Inserir frases iniciais (pelo menos 5 por categoria) com variacoes criativas.

### Alteracoes nas Edge Functions

**`supabase/functions/auto-process-ranking/index.ts`** (linhas 730-743):
- Antes de montar os destaques, buscar frases da tabela `discord_highlight_phrases` agrupadas por categoria
- Selecionar frase usando `dia_do_ano % total_frases` como indice
- Aplicar placeholders `{name}` e `{value}` nos templates
- Fallback para frases padrao caso a tabela esteja vazia

**`supabase/functions/discord-webhook/index.ts`** (linhas 348-366):
- Mesma logica: buscar frases, selecionar por dia do ano, aplicar placeholders
- Usar service role client para ler a tabela (ja existe autenticacao no fluxo)

### Tela de Gerenciamento (Admin)

Novo componente `src/components/DiscordPhrasesManager.tsx`:
- Listar frases agrupadas por categoria (kill_streak, best_kda, cone)
- Botao para adicionar nova frase por categoria
- Editar/remover frases existentes
- Preview dos placeholders disponiveis (`{name}`, `{value}`)

Adicionar como nova aba ou secao dentro da area de Gerenciamento no `DatabaseManager.tsx`.

---

## Parte 2: Throne Conquest no Monitoramento

### Alteracoes em `src/components/AutoProcessMonitor.tsx`

1. **Interface `MatchData`**: adicionar campo `event_type` (string)
2. **Interface `ExpectedEvent`**: adicionar campo `eventType` (`'boss_event' | 'throne_conquest'`)
3. **`fetchRecentMatches`**: incluir `event_type` no select, aumentar limit para 21
4. **`getExpectedEvents`**: nas tercas (dayOfWeek === 2), adicionar evento Throne com hora 21, minuto 36, label `THRONE`, eventType `throne_conquest`
5. **`isEventProcessed`**: comparar tambem `event_type` para nao confundir Boss com Throne no mesmo horario
6. **`handleManualProcess`**: enviar `eventType` no body da invocacao da edge function
7. **UI**: Badge visual diferenciada para Throne (cor amarela/dourada) com label "THRONE" ao lado da data

### Logica de eventos esperados por dia

```text
Segunda (1): 21:00 BOSS, 22:00 BOSS
Terca (2):   20:00 BOSS, 21:36 THRONE, 22:30 BOSS
Quarta (3):  20:00 BOSS, 22:00 BOSS
Quinta (4):  20:00 BOSS, 22:30 BOSS
Sexta (5):   20:00 BOSS, 22:00 BOSS
Sabado (6):  20:00 BOSS, 22:00 BOSS
Domingo (0): 20:00 BOSS, 22:00 BOSS
```

---

## Resumo de arquivos

| Arquivo | Acao |
|---------|------|
| Nova migracao SQL | Criar tabela `discord_highlight_phrases` + RLS + dados iniciais |
| `supabase/functions/auto-process-ranking/index.ts` | Buscar frases dinamicas da tabela |
| `supabase/functions/discord-webhook/index.ts` | Buscar frases dinamicas da tabela |
| `src/components/DiscordPhrasesManager.tsx` | NOVO - Tela de gerenciamento de frases |
| `src/components/DatabaseManager.tsx` | Adicionar acesso ao gerenciador de frases |
| `src/components/AutoProcessMonitor.tsx` | Incluir Throne + event_type na logica |
