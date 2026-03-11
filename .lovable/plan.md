

# Sistema de Análise de Desempenho PvP - Plano de Implementação

## Visão Geral

Dashboard analítico completo, acessível apenas para administradores, com 6 módulos organizados em sub-abas. Reutiliza padrões existentes (filtros com date-picker, queries paginadas, Recharts para gráficos).

## Estrutura de Navegação

```text
Sidebar
└── 📊 Análise PvP  [requiresAdmin: true]

Dashboard (sub-abas internas via Tabs)
├── Players      → Stats individuais + busca por nome
├── Guilds       → Stats por guild + ranking interno
├── PvP Direto   → Player vs Player / Guild vs Guild
├── Classes      → Eficiência, dominância, matriz, meta
├── Gráficos     → Evolução temporal (kills/dia, KDA)
└── Insights IA  → Análise automática via Lovable AI
```

## Filtros Globais (compartilhados entre sub-abas)

- Data inicial / final (Calendar picker)
- Hora inicial / final (Select)
- Tipo de evento: Boss / Throne / Todos
- Guild específica (opcional)

## Módulos

### 1. Player Analytics
- Autocomplete de jogador (tabela `characters`)
- Métricas: Kills, Deaths, KDA, Kill Streak máximo, First Bloods, vítimas únicas
- Rival que mais matou / que mais morreu para
- Tabela detalhada de confrontos por oponente
- Rankings: Top Killers, Mais Mortes, Melhor KDA

### 2. Guild Analytics
- Select de guild (populado de `characters`)
- Métricas: Total kills/deaths, KDA guild, guild mais abatida, guild rival dominante
- Participação em eventos (contagem de partidas)
- Ranking interno de membros
- Ranking: Guild Dominante

### 3. Confronto Direto (PvP Direto)
- **Player vs Player**: Selecionar 2 jogadores, comparar kills mútuas, taxa de dominância
- **Guild vs Guild**: Selecionar 2 guilds, comparar kills/mortes, top performers de cada lado
- Tabela: Rivalidade PvP (Player | Rival | Confrontos)

### 4. Análise de Classes
- Jogadores por classe + Pick Rate (%)
- Kills/Deaths/KDA por classe
- **Kill Efficiency Index**: kills / jogadores da classe
- **Classe vs Classe**: Tabela cruzada (killer_class x victim_class)
- **Matriz de Dominância**: Heatmap com % de vitória entre classes
- **Score de Dominância**: (Kills - Deaths) / Players
- **META do Servidor**: Ranking automático de classes por score
- Rankings: Mais letal, Mais mortes, Mais eficiente, Dominante

### 5. Gráficos (Recharts)
- Player: Kills/dia (LineChart), Mortes/dia, Evolução KDA
- Guild: Kills por guild rival (BarChart), Participação PvP
- Classes: Distribuição (PieChart), Performance cruzada (Heatmap via BarChart), Eficiência (BarChart)

### 6. Insights IA (Lovable AI)
- Edge function `pvp-ai-insights` usando `google/gemini-3-flash-preview`
- Envia dados agregados (top players, guilds, rivalidades, classes)
- Retorna insights em português (dominâncias, tendências, meta)
- Tratamento de 429/402

## Consultas ao Banco

Todas as queries usam tabelas existentes (`pvp_kill_logs`, `pvp_matches`, `pvp_match_players`, `characters`) com paginação `.range()` (PAGE_SIZE 1000). Filtro de jogadores banidos aplicado. Sem necessidade de novas tabelas ou migrações.

## Cálculos Chave no Frontend

- **Kill Streak**: Sequência de kills sem morrer por match (ordem dos logs)
- **First Blood**: Primeiro kill de cada match
- **Kill Efficiency**: kills da classe / jogadores da classe
- **Dominância**: `kills_contra / (kills_contra + mortes_para) * 100`
- **Pick Rate**: `jogadores_classe / total_jogadores * 100`
- **META Score**: Combinação de eficiência + dominância média

## Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `src/components/analytics/PvPAnalyticsDashboard.tsx` |
| Criar | `src/components/analytics/AnalyticsFilters.tsx` |
| Criar | `src/components/analytics/PlayerAnalytics.tsx` |
| Criar | `src/components/analytics/GuildAnalytics.tsx` |
| Criar | `src/components/analytics/DirectCombat.tsx` |
| Criar | `src/components/analytics/ClassAnalytics.tsx` |
| Criar | `src/components/analytics/AnalyticsCharts.tsx` |
| Criar | `src/components/analytics/AIInsights.tsx` |
| Criar | `supabase/functions/pvp-ai-insights/index.ts` |
| Modificar | `src/components/AppSidebar.tsx` — novo item |
| Modificar | `src/pages/Index.tsx` — novo case |

