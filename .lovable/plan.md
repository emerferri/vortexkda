# Plano de Performance + Novas Features

Execução em **5 fases sequenciais**. Cada fase é entregável e testável de forma independente.

---

## Fase 1 — Índices + Migração de Rankings para RPC

### 1.1 Índices adicionais no banco
Os índices principais já existem. Vou adicionar os que faltam para queries pesadas:

- `idx_pvp_matches_date_event_hour` composto em `(match_date, event_type, match_hour)` — usado em todos os filtros de período
- `idx_kill_logs_killer_match` composto em `(killer_name, match_id)` — para agregações por jogador
- `idx_kill_logs_victim_match` composto em `(victim_name, match_id)` — para deaths
- `idx_characters_name_banned` composto em `(name, banned)` — lookups com filtro de banidos
- Análise via `EXPLAIN ANALYZE` nas queries mais lentas para confirmar uso

### 1.2 Migrar rankings pesados para RPC functions (SQL no banco)

Criar funções `SECURITY DEFINER` no Postgres seguindo o padrão de `get_ranking_geral` / `get_ranking_fogo_amigo` que já temos:

| Componente atual | Nova RPC | Ganho esperado |
|---|---|---|
| `PutinhaRanking` (agregação dominador→vítima) | `get_ranking_putinha(filtros)` | ~10× |
| `NeverPositiveKDA` (filtra KDA < 1) | `get_ranking_nunca_positivo(filtros)` | ~8× |
| `KillStreakRanking` (sequências por match) | `get_ranking_killstreak(filtros)` | ~15× |
| `MuralDaVergonha` (mais mortes) | `get_ranking_mural_vergonha(filtros)` | ~8× |
| `BestPerClassRanking` (melhor por classe) | `get_ranking_best_per_class(filtros)` | ~10× |
| `ReisDoPVP` (top kills por evento) | `get_ranking_reis_pvp(filtros)` | ~10× |
| `ClassMatchup` (matriz classe×classe) | `get_class_matchup_matrix(filtros)` | ~20× |
| `ClassGuildRanking` (classes/guild) | `get_class_guild_ranking(filtros)` | ~10× |

Cada RPC respeita: fórmula de score `(kills × 3) + (KDA × 2) - (deaths × 1.5)`, filtros de banidos, agrupamento BADBOYS, e regras de evento (boss_event/throne/arka).

### 1.3 Refator dos componentes
Cada componente passa de "fetch logs + agregar em JS com paginação 10k" para um único `supabase.rpc(...)`. Lógica de UI/Discord export é mantida 100% igual. **Nenhuma mudança visual.**

### 1.4 Edge function `discord-webhook`
Substituir N queries de `class_short` por **um único** `IN (...)` lookup batch.

---

## Fase 2 — Sistema de Temporadas (Seasons)

### Schema
- Tabela `seasons` (id, name, start_date, end_date, status: active/closed, created_at)
- Tabela `season_snapshots` (id, season_id, ranking_type, position, player_name, player_class, player_guild, kills, deaths, kda, score, snapshot_at)

### Lógica
- Cron job mensal (dia 1 às 00:05 BRT) via `pg_cron`:
  1. Fecha temporada anterior (status=closed)
  2. Salva top 10 de cada ranking (Geral, Putinha, Nunca Positivo, Best per Class, Reis do PvP, Fogo Amigo) usando as RPCs da Fase 1
  3. Cria nova temporada
  4. Dispara webhook Discord "🏆 Hall da Fama — [Mês/Ano]" com tabelas formatadas (monospace ASCII, padrão do projeto)

### UI
- Nova rota **"Hall da Fama"** na sidebar (público)
- Lista de temporadas fechadas → ao clicar, vê snapshots top 10 por categoria
- Badge "Campeão Histórico" no perfil de quem foi #1 em alguma temporada

---

## Fase 3 — Alertas de Marcos no Discord

### Schema
- Tabela `player_milestones` (id, player_name, milestone_type, milestone_value, achieved_at, posted_to_discord)
- Tipos: `kills_total` (100, 500, 1000, 5000, 10000), `kda_record`, `streak_dominacao` (X bosses seguidos por guild), `single_match_kills` (10, 20, 30+)

### Lógica
- Edge function `check-milestones` executada **após cada processamento de evento** (em `auto-process-ranking`):
  1. Recalcula totais agregados via RPC
  2. Compara com últimos marcos salvos
  3. Insere novos registros e dispara Discord post: "🎉 **PlayerX** atingiu **1000 kills**!"
- Para "guild dominou N eventos seguidos": query nas últimas N matches por event_type
- Para "novo recorde de KDA": compara com `MAX(kda)` histórico armazenado

### UI
- Painel admin "Marcos & Conquistas" com histórico e botão para repostar manualmente
- Configuração dos thresholds (admin pode editar valores)

---

## Fase 4 — Sistema de Conquistas/Badges

### Schema
- Tabela `badges` (id, code, name, description, icon, criteria_json, rarity: common/rare/epic/legendary)
- Tabela `player_badges` (id, player_name, badge_id, earned_at, match_id_ref nullable)

### Badges iniciais
| Code | Nome | Critério |
|---|---|---|
| `first_blood` | Primeira Sangue | Primeiro kill registrado em match |
| `carrasco` | Carrasco | 10+ kills em uma única match |
| `executor` | Executor | 20+ kills em uma única match |
| `lendario` | Lendário | 30+ kills em uma única match |
| `indestrutivel` | Indestrutível | 0 deaths em evento com 5+ kills |
| `vingador` | Vingador | Matar quem te matou no mesmo evento |
| `dominator` | Dominador | 5+ kills no mesmo alvo num evento |
| `veterano` | Veterano | 50+ eventos participados |
| `lenda_viva` | Lenda Viva | Top 1 em 3+ temporadas |

### Lógica
- Função SQL `evaluate_badges_for_match(match_id)` rodada após cada import
- UI: aba "Conquistas" em cada perfil de jogador (PlayerEventDevelopment) + ranking público "Top Colecionadores"
- Discord post quando alguém ganha badge épico/lendário pela 1ª vez

---

## Fase 5 — Real-time Updates

### Setup
- `ALTER PUBLICATION supabase_realtime ADD TABLE pvp_matches, pvp_kill_logs, player_milestones, player_badges`
- `REPLICA IDENTITY FULL` nas tabelas

### Implementação
- Hook `useRealtimeRankings()` que invalida o React Query cache quando novos kill_logs chegam
- Indicador visual "🔴 AO VIVO" no topo dos rankings quando há evento em andamento (detectado via match criada nas últimas 2h)
- Toast notification: "Novo evento processado! Atualizando rankings..."
- Animação suave nas posições do ranking quando trocam (framer-motion)
- Realtime em badges/marcos: banner flutuante "🏆 PlayerX acabou de ganhar [Badge]!"

---

## Detalhes Técnicos

### Banco de dados
- **3 migrações de schema**: índices (Fase 1), seasons+snapshots (Fase 2), milestones+badges (Fases 3-4)
- **8 RPC functions novas** + ajustes nas RPCs existentes
- **2 cron jobs novos**: fechamento de temporada (mensal), check-milestones (após cada evento)
- Realtime publication update (Fase 5)

### Edge functions
- Nova `close-season` (cron + manual trigger)
- Nova `check-milestones` (chamada por `auto-process-ranking`)
- Ajuste em `discord-webhook` (batch lookup) e `auto-process-ranking` (chama check-milestones)

### Frontend
- Refator de **8 componentes de ranking** para consumir RPC (Fase 1)
- Nova página `HallDaFama.tsx` + rota (Fase 2)
- Componentes `MilestonesPanel.tsx`, `BadgesShowcase.tsx`, `LiveIndicator.tsx`
- Hook `useRealtimeRankings.ts`
- Sem mudanças visuais nos rankings existentes — apenas troca da fonte de dados

### Compatibilidade
- Todas as RPCs respeitam regras existentes salvas em memória (BADBOYS, banidos, schedule, score formula, exclusões Cone Monodedo etc.)
- Nenhuma quebra de feature atual; rollout incremental por fase

### Estimativa de impacto de performance
- Carregamento inicial dos rankings: **3-8s → 200-500ms**
- Switch entre tabs analytics: já está rápido (cache compartilhado)
- Discord webhook post: **~2s → <500ms**
- Eliminação de paginação 10k no cliente em 8 componentes
