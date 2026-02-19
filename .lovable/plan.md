

# Frases Dinamicas no Discord + Throne no Monitoramento

## Parte 1: Criar tabela `discord_highlight_phrases`

Criar a tabela no banco de dados com:
- `id` (uuid, PK)
- `category` (text): `kill_streak`, `best_kda`, `cone`
- `phrase_template` (text): template com placeholders `{name}` e `{value}`
- `created_at` (timestamptz)

RLS: leitura publica, escrita apenas admin.

Inserir aproximadamente 8 frases por categoria com variacoes criativas de zueira.

## Parte 2: Alterar Edge Functions

**`auto-process-ranking`**: Antes de montar destaques, buscar frases da tabela, selecionar por `dia_do_ano % total_frases`, aplicar placeholders `{name}` e `{value}`. Fallback para frase padrao se tabela vazia.

**`discord-webhook`**: Mesma logica de frases dinamicas.

## Parte 3: Tela de gerenciamento (Admin)

Novo componente `DiscordPhrasesManager.tsx`:
- Listar frases por categoria
- Adicionar/editar/remover frases
- Preview dos placeholders

Integrar no `DatabaseManager.tsx`.

## Parte 4: Throne Conquest no Monitoramento

Alterar `AutoProcessMonitor.tsx`:
- Adicionar `event_type` nas interfaces e queries
- Nas tercas-feiras, incluir evento Throne 21:36 na lista de esperados
- Comparar `event_type` na verificacao de duplicatas
- Badge visual diferenciada (amarelo/dourado) para Throne

## Detalhes tecnicos

### Arquivos afetados
| Arquivo | Acao |
|---------|------|
| Nova migracao SQL | Criar tabela + RLS + seed de frases |
| `supabase/functions/auto-process-ranking/index.ts` | Buscar frases dinamicas |
| `supabase/functions/discord-webhook/index.ts` | Buscar frases dinamicas |
| `src/components/DiscordPhrasesManager.tsx` | NOVO - gerenciamento de frases |
| `src/components/DatabaseManager.tsx` | Adicionar aba/secao de frases |
| `src/components/AutoProcessMonitor.tsx` | Throne + event_type |

### Logica de selecao de frases
```text
indice = dia_do_ano % total_frases_da_categoria
```
Garante variedade diaria e determinismo (mesma frase o dia todo).

### Eventos esperados por dia da semana
```text
Segunda (1): 21:00 BOSS, 22:00 BOSS
Terca (2):   20:00 BOSS, 21:36 THRONE, 22:30 BOSS
Quarta (3):  20:00 BOSS, 22:00 BOSS
Quinta (4):  20:00 BOSS, 22:30 BOSS
Sexta (5):   20:00 BOSS, 22:00 BOSS
Sabado (6):  20:00 BOSS, 22:00 BOSS
Domingo (0): 20:00 BOSS, 22:00 BOSS
```

