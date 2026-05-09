## Objetivo

Excluir totalmente o **fogo amigo** (kill entre membros da mesma guild) do cálculo de kills, deaths, KDA e score nos rankings de PVP — como se a kill nunca tivesse acontecido. A regra vale **somente para `boss_event`** (único evento onde fogo amigo pode ocorrer no ranking PVP).

O ranking **Fogo Amigo** continua intacto (ele é justamente quem mostra esses casos), assim como Analytics, Putinha, Kill Streak, Confrontos Diretos e Class Matchup.

## Rankings afetados

1. Ranking Geral (Boss)
2. Reis do PVP / Cones Monodedo
3. Mural da Vergonha
4. Nunca Positivo
5. Best per Class (melhor/pior por classe)
6. Hall da Fama (snapshots usam as funções acima — já reflete automaticamente nos próximos fechamentos)

## Estratégia técnica

Hoje há duas fontes de dados:

- **`pvp_kill_logs`** (par killer→victim) — fácil filtrar mesma guild.
- **`pvp_match_players`** (totais agregados por partida com `kills/deaths/kda`) — já vem somado, sem distinguir aliado/inimigo.

Como queremos remover fogo amigo dos totais, vou **recalcular kills/deaths a partir de `pvp_kill_logs`** (excluindo pares same-guild para `boss_event`) em vez de confiar nos agregados de `pvp_match_players`.

Para identificar fogo amigo: `JOIN characters ck ON ck.name = killer_name` e `JOIN characters cv ON cv.name = victim_name` e ignorar quando `ck.guild = cv.guild AND ck.guild <> ''` — mesmo critério já usado em `get_ranking_fogo_amigo`.

Importante: aplicar o filtro **apenas quando `event_type = 'boss_event'`** (em outros eventos não há "guild aliada" relevante e a regra não se aplica).

## Mudanças por função (uma migration)

### `get_ranking_geral`
Já lê de `pvp_kill_logs`. Adicionar nas CTEs `kills_agg`, `deaths_agg`, `per_match_kills` e na contagem de partidas o filtro:

```sql
AND NOT EXISTS (
  SELECT 1 FROM characters ck JOIN characters cv ON cv.guild = ck.guild
  WHERE ck.name = kl.killer_name AND cv.name = kl.victim_name
    AND ck.guild IS NOT NULL AND ck.guild <> ''
)
```

### `get_ranking_mural_vergonha`, `get_ranking_nunca_positivo`, `get_ranking_reis_pvp`, `get_ranking_best_per_class`
Hoje agregam de `pvp_match_players`. Quando `p_event_type = 'boss_event'` (ou `NULL`/`'all'` em contexto boss), substituir o `agg`/`scored` por uma CTE que recalcula a partir de `pvp_kill_logs`:

```sql
WITH effective_logs AS (
  SELECT kl.match_id, kl.killer_name, kl.victim_name
  FROM pvp_kill_logs kl
  INNER JOIN filtered_matches fm ON kl.match_id = fm.mid
  WHERE NOT EXISTS (
    SELECT 1 FROM characters ck JOIN characters cv ON cv.guild = ck.guild
    WHERE ck.name = kl.killer_name AND cv.name = kl.victim_name
      AND ck.guild IS NOT NULL AND ck.guild <> ''
      AND fm.event_type = 'boss_event'
  )
),
per_match AS (
  SELECT match_id, player_name,
    SUM(CASE WHEN player_name = killer_name THEN 1 ELSE 0 END) AS kills,
    SUM(CASE WHEN player_name = victim_name THEN 1 ELSE 0 END) AS deaths
  FROM effective_logs
  CROSS JOIN LATERAL (VALUES (killer_name), (victim_name)) v(player_name)
  GROUP BY match_id, player_name
)
```

A partir de `per_match`, recalcular `kda = kills/deaths` e o `event_score` com a fórmula oficial `(k*3) + (kda*2) - (d*1.5)`.

Para eventos não-boss (Throne/Arka), manter o caminho atual usando `pvp_match_players` para preservar comportamento.

### `close_current_season`
Não precisa mudar. As funções acima passam `'boss_event'` no fechamento e já vão refletir o novo cálculo.

## Não muda

- `get_ranking_fogo_amigo` (justamente lista o fogo amigo)
- `get_ranking_putinha` (par dominador→vítima, irrelevante guild)
- `get_ranking_kill_streak` (streak por sequência, mantém comportamento atual)
- `get_class_matchup_matrix`, `get_class_guild_ranking`, `get_analytics_kill_logs` (analytics)
- Qualquer componente front-end (apenas consome o resultado das RPCs)

## Impacto

- Players que matavam muitos da própria guild verão **score menor** no Ranking Geral.
- Vítimas frequentes de fogo amigo verão **menos deaths** no Mural da Vergonha.
- Próximo fechamento de temporada salvará snapshots já com a regra. Snapshots antigos não são recalculados (é histórico).

## Validação

Após a migration, validar com query manual em um jogador conhecido:
- Comparar `total_kills` antes/depois no Ranking Geral filtrando `event_type=boss_event`.
- Confirmar que `get_ranking_fogo_amigo` continua retornando os mesmos valores.