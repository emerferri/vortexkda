
## Plano: Novo Ranking "Fogo Amigo"

Criar um ranking que lista apenas kills entre membros da mesma guild (team-kills), seguindo os mesmos filtros e fórmula de score do Ranking Boss.

### O que será construído

**1. Função SQL `get_ranking_fogo_amigo`** (nova migration)
- Mesmos parâmetros do `get_ranking_geral`: `p_date_from`, `p_date_to`, `p_hour_from`, `p_hour_to`
- Adicionar parâmetro `p_event_type` (boss_event / throne_conquest / arka_war / all) para flexibilidade
- Lógica: JOIN entre `pvp_kill_logs` + `characters` (killer) + `characters` (victim), filtrando onde `killer.guild = victim.guild` e ambos não banidos e killer ≠ victim
- Retorna: `player_name`, `player_class`, `player_class_short`, `player_guild`, `friendly_kills` (kills em aliados), `friendly_deaths` (vezes morto por aliado), `kda`, `event_score` usando fórmula `(K*3) + (KDA*2) - (D*1.5)`
- Ordenado por `friendly_kills DESC`

**2. Novo componente `src/components/RankingFogoAmigo.tsx`**
- Espelhar a estrutura visual de `RankingGeral.tsx`
- Filtros: data (de/até), hora (de/até), guild, classe, busca por nome, tipo de evento
- Tabela com colunas: Posição | Personagem | Sigla | Guild | Kills em Aliados | Mortes p/ Aliados | KDA | Score
- Badges de pódio (🥇🥈🥉) iguais aos outros rankings
- Botão "Publicar no Discord" reutilizando o webhook (opcional — confirmar abaixo)

**3. Integração no menu**
- `src/components/AppSidebar.tsx`: novo item "Fogo Amigo" (ícone `Flame` do lucide-react) no grupo de rankings
- `src/pages/Index.tsx`: novo case `'fogo-amigo'` no `renderContent()` renderizando `<RankingFogoAmigo />`

### Detalhes técnicos

- A lógica de "fogo amigo" exige que ambos personagens existam na tabela `characters` com mesma `guild` (não vazia). Kills onde killer ou victim não tem cadastro/guild serão ignorados.
- Banidos continuam excluídos.
- Score usa a mesma fórmula consagrada do projeto: `(kills * 3) + (KDA * 2) - (deaths * 1.5)`, onde kills/deaths aqui referem-se apenas a eventos de fogo amigo.
- Performance: query agregada server-side (mesmo padrão do `get_ranking_geral`), evitando processamento no cliente.

### Arquivos afetados
- Nova migration SQL (cria `get_ranking_fogo_amigo`)
- `src/components/RankingFogoAmigo.tsx` (novo)
- `src/components/AppSidebar.tsx` (novo item de menu)
- `src/pages/Index.tsx` (novo case no switch)
- `src/integrations/supabase/types.ts` (atualizado automaticamente)

### Pergunta de confirmação
Incluir também o botão "Publicar no Discord" para esse novo ranking, ou deixar apenas visualização no site?
