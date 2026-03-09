
# Melhoria de Performance do Ranking Geral

## Problema Identificado

O Ranking Geral esta lento porque:

1. Busca **20.000+ registros** da tabela `pvp_kill_logs` no navegador do usuario
2. Toda a agregacao (kills, deaths, KDA, pontuacao) e feita no **client-side** com JavaScript
3. Faltam indices importantes no banco de dados (ex: `event_type` na tabela `pvp_matches`)
4. Sao feitas **15+ requisicoes HTTP** paginadas de 1000 em 1000 registros

## Solucao Proposta

### 1. Criar indices que estao faltando no banco

Indices novos necessarios:
- `pvp_matches(event_type)` - toda query filtra por event_type, mas nao existe indice
- `pvp_matches(event_type, match_date)` - indice composto para filtros combinados
- `pvp_matches(match_hour)` - usado nos filtros de hora

### 2. Criar funcao no banco para agregacao server-side

Em vez de trazer 20.000+ linhas para o navegador e processar com JavaScript, criar uma funcao SQL (`get_ranking_geral`) que faz toda a agregacao direto no banco de dados e retorna apenas o resultado final (aprox. 100-200 linhas de jogadores agregados).

A funcao recebera os parametros de filtro (data inicio, data fim, hora inicio, hora fim) e retornara os dados ja agregados: nome do jogador, total kills, total deaths, KDA, pontuacao, numero de partidas.

### 3. Refatorar o componente RankingGeral

Substituir as multiplas queries paginadas por uma unica chamada RPC (`supabase.rpc('get_ranking_geral', {...})`), que retornara os dados ja prontos.

## Impacto Esperado

- **Antes**: 15+ requisicoes HTTP, 20.000+ linhas transferidas, processamento pesado no navegador
- **Depois**: 1 requisicao HTTP, ~200 linhas transferidas, processamento feito no banco

## Detalhes Tecnicos

### Indices SQL

```text
CREATE INDEX idx_pvp_matches_event_type ON pvp_matches(event_type);
CREATE INDEX idx_pvp_matches_event_type_date ON pvp_matches(event_type, match_date);
CREATE INDEX idx_pvp_matches_hour ON pvp_matches(match_hour);
```

### Funcao SQL `get_ranking_geral`

Parametros de entrada:
- `p_date_from` (date, opcional)
- `p_date_to` (date, opcional)
- `p_hour_from` (int, opcional)
- `p_hour_to` (int, opcional)

Logica:
1. Buscar match_ids de boss_event com filtros aplicados
2. Agregar kills e deaths a partir de `pvp_kill_logs` usando esses match_ids
3. Calcular KDA, pontuacao e numero de partidas
4. Fazer JOIN com tabela `characters` para obter classe e guild
5. Excluir jogadores banidos
6. Retornar resultado agregado

Retorno: tabela com colunas (player_name, player_class, player_guild, total_kills, total_deaths, kda, weighted_kda, matches_played, event_score, single_match_max_kills)

### Refatoracao do componente

- Remover toda a logica de paginacao e agregacao client-side
- Substituir por `supabase.rpc('get_ranking_geral', { p_date_from, p_date_to, p_hour_from, p_hour_to })`
- Manter a logica de fuzzy match de classes apenas para casos nao cobertos pelo JOIN
- Manter toda a UI, filtros, exports e publicacao Discord inalterados

### Arquivos alterados

1. **Nova migration SQL** - Indices + funcao `get_ranking_geral`
2. **src/components/RankingGeral.tsx** - Refatorar queryFn para usar RPC
