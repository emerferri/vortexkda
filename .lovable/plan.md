

# Implementacao: Frases Dinamicas + Throne no Monitoramento

## Status atual

- Tabela `discord_highlight_phrases`: NAO EXISTE no banco
- Edge functions: frases de destaque FIXAS (hardcoded)
- AutoProcessMonitor: NAO inclui Throne Conquest nas tercas
- DiscordPhrasesManager: NAO EXISTE

## Parte 1: Criar tabela no banco de dados

Criar tabela `discord_highlight_phrases` com:
- `id` (uuid, PK)
- `category` (text): `kill_streak`, `best_kda`, `cone`
- `phrase_template` (text): template com `{name}` e `{value}`
- `created_at` (timestamptz)

RLS: leitura publica, escrita apenas admin.

Inserir ~8 frases por categoria com variacoes de zueira. Exemplos:

**kill_streak:**
- `{name} matou {value} vezes sem morrer! Ta possuido!`
- `{name} fez {value} kills seguidas! Maquina de guerra!`
- `{name} com {value} kills sem dar respawn! Alguem para esse maluco!`
- `Sequencia insana de {value} kills! {name} esta on fire!`
- `{name} eliminou {value} sem piedade! O cemiterio ta lotado!`
- `{name} com {value} kills seguidas! Nasceu pra isso!`
- `{name} mandou {value} pro caixao sem morrer! Brabo demais!`
- `{name} nao morre nunca! {value} kills na sequencia!`

**best_kda:**
- `{name} com KDA de {value}, cirurgico no PVP!`
- `{name} nao erra um golpe! KDA brutal: {value}`
- `{name} esse manja de posicionamento, KDA implacavel {value}`
- `{name} ta jogando xadrez enquanto os outros jogam damas! KDA: {value}`
- `{name} com KDA {value}! Parece hack mas e talento!`
- `{name} KDA de {value}! Esse ai leu o manual do jogo!`
- `{name} com {value} de KDA! Precisao cirurgica!`
- `{name} ta dando aula! KDA absurdo de {value}!`

**cone:**
- `{name} morreu {value} vezes! Alguem empresta um mouse pra ele!`
- `{name} caiu {value} vezes! Tava jogando de olhos fechados?`
- `{name} morreu {value} vezes! Esse deve estar jogando sem mouse!`
- `{name} com {value} mortes! O chao ta com saudade dele!`
- `{name} visitou o respawn {value} vezes! Ja tem cartao fidelidade!`
- `{name} morreu {value} vezes! Ta treinando pra morrer mais rapido?`
- `{name} com {value} deaths! Recorde de idas ao cemiterio!`
- `{name} tombou {value} vezes! Pelo menos e persistente!`

## Parte 2: Alterar Edge Functions

### `auto-process-ranking` (linhas ~730-743)
Antes de montar os destaques:
1. Buscar frases da tabela usando service role client
2. Calcular `dayOfYear = Math.floor((Date.now() - new Date(year, 0, 0)) / 86400000)`
3. Para cada categoria, selecionar `phrases[dayOfYear % phrases.length]`
4. Aplicar `.replace('{name}', nome).replace('{value}', valor)`
5. Fallback para frases atuais se tabela vazia

### `discord-webhook` (linhas ~354-366)
Mesma logica de selecao e aplicacao de frases dinamicas.

## Parte 3: Tela de gerenciamento (Admin)

Novo componente `src/components/DiscordPhrasesManager.tsx`:
- Listar frases agrupadas por categoria (kill_streak, best_kda, cone)
- Botao para adicionar nova frase por categoria
- Editar/remover frases existentes
- Preview dos placeholders disponiveis

Integrar no `DatabaseManager.tsx` como nova aba "Frases Discord" (grid passa de 5 para 6 colunas).

## Parte 4: Throne no AutoProcessMonitor

Alteracoes em `src/components/AutoProcessMonitor.tsx`:

1. Interface `MatchData`: adicionar `event_type` (string)
2. Interface `ExpectedEvent`: adicionar `eventType` ('boss_event' | 'throne_conquest')
3. `fetchRecentMatches`: incluir `event_type` no select, limit para 21
4. `getExpectedEvents`: nas tercas (dayOfWeek === 2), adicionar evento Throne 21:36
5. `isEventProcessed`: comparar tambem `event_type`
6. `handleManualProcess`: enviar `eventType` no body
7. Badge visual dourada/amarela para diferenciar Throne de Boss

Eventos esperados:
```text
Segunda (1): 21:00 BOSS, 22:00 BOSS
Terca (2):   20:00 BOSS, 21:36 THRONE, 22:30 BOSS
Quarta (3):  20:00 BOSS, 22:00 BOSS
Quinta (4):  20:00 BOSS, 22:30 BOSS
Sexta (5):   20:00 BOSS, 22:00 BOSS
Sabado (6):  20:00 BOSS, 22:00 BOSS
Domingo (0): 20:00 BOSS, 22:00 BOSS
```

## Arquivos afetados

| Arquivo | Acao |
|---------|------|
| Nova migracao SQL | Criar tabela + RLS + seed de ~24 frases |
| `supabase/functions/auto-process-ranking/index.ts` | Buscar frases dinamicas |
| `supabase/functions/discord-webhook/index.ts` | Buscar frases dinamicas |
| `src/components/DiscordPhrasesManager.tsx` | NOVO - gerenciamento de frases |
| `src/components/DatabaseManager.tsx` | Adicionar aba "Frases Discord" |
| `src/components/AutoProcessMonitor.tsx` | Throne + event_type |

