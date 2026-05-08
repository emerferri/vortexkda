## Objetivo
Fazer o Hall da Fama considerar **apenas eventos do tipo `boss_event`**, removendo Throne Conquest e Arka War dos snapshots da temporada.

## Mudança

Atualizar a função SQL `close_current_season` para passar `'boss_event'` (em vez de `'all'`) como filtro de `event_type` em todas as 7 chamadas de ranking:

- `get_ranking_geral`
- `get_ranking_reis_pvp` (Reis + Cones)
- `get_ranking_kill_streak`
- `get_ranking_mural_vergonha`
- `get_ranking_fogo_amigo`
- `get_ranking_putinha`

Assim, ao fechar uma temporada, o Top 10 salvo em `season_snapshots` refletirá somente partidas de Boss.

## Detalhes técnicos

- Migration recriando `close_current_season()` (mesma estrutura atual, trocando `'all'` → `'boss_event'`).
- Sem alterações em frontend (`HallDaFama.tsx`) nem na edge function `close-season` — eles apenas exibem/postam o que vier da função.
- Snapshots já existentes de temporadas fechadas não serão recalculados automaticamente. Se quiser, posso reabrir e refechar a Temporada atual após o ajuste para que o próximo fechamento já saia "limpo".

## Observação

O texto descritivo no header do componente (`Top 10 de cada ranking nas temporadas encerradas`) pode ser ajustado para deixar claro "apenas Boss Event" — confirme se quer essa alteração de copy junto.