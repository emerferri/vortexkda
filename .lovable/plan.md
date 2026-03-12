
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
├── Escalação    → Team Builder com métricas avançadas por membro
└── Insights IA  → Análise automática via Lovable AI
```

## Módulo Escalação & Team Builder

- Seleção de guild → tabela de membros com: Kills, Deaths, KDA, Participação%, Consistência (desvio padrão), Melhor/Pior evento, Tendência
- Classificação automática: MVP, Constante, Oscilante, Destaque, Em Evolução, Reserva
- Composição sugerida (melhor time por score combinado)
- Insights IA táticos (prompt especializado em escalação)
- **✅ Campo Piloto**: Cada personagem pode ter um `pilot_name` associado (pessoa real)
- **✅ Importação de Lista de Pilotos**: Na Escalação, importar lista de pilotos disponíveis (TXT/Excel/textarea) para filtrar formação por disponibilidade

## Arquivos

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
| `src/components/analytics/TeamBuilder.tsx` |
| `supabase/functions/pvp-ai-insights/index.ts` |
