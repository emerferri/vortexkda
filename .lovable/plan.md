
# Sistema de Análise de Desempenho PvP - Plano de Implementação

## Status: ✅ Implementado

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

## Arquivos Criados

| Arquivo |
|---------|
| `src/hooks/useAnalyticsData.ts` |
| `src/components/analytics/PvPAnalyticsDashboard.tsx` |
| `src/components/analytics/AnalyticsFilters.tsx` |
| `src/components/analytics/PlayerAnalytics.tsx` |
| `src/components/analytics/GuildAnalytics.tsx` |
| `src/components/analytics/DirectCombat.tsx` |
| `src/components/analytics/ClassAnalytics.tsx` |
| `src/components/analytics/AnalyticsCharts.tsx` |
| `src/components/analytics/AIInsights.tsx` |
| `supabase/functions/pvp-ai-insights/index.ts` |

## Arquivos Modificados

| Arquivo |
|---------|
| `src/components/AppSidebar.tsx` |
| `src/pages/Index.tsx` |
| `supabase/config.toml` |
