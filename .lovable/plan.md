

# Módulo "Escalação & Team Builder" — Insights Estratégicos por Guild

## Objetivo

Nova aba "Escalação" no dashboard de Análise PvP que permite ao líder de guild avaliar seus membros para montar a melhor formação de equipe, identificando jogadores constantes, oscilantes, destaques e composições ideais.

## O que será construído

### Nova aba no Dashboard
Adicionar 7a aba "Escalação" no `PvPAnalyticsDashboard.tsx` com ícone de escudo/estratégia.

### Componente `src/components/analytics/TeamBuilder.tsx`

**Filtro obrigatório**: Seleção da guild a ser analisada.

**Métricas por membro da guild (tabela principal)**:

| Métrica | Descrição |
|---------|-----------|
| Kills totais | Soma de kills no período |
| Deaths totais | Soma de mortes |
| KDA | kills / deaths |
| Participação | % de eventos que participou vs total de eventos no período |
| Consistência | Desvio padrão do KDA por partida (baixo = constante, alto = oscilante) |
| Melhor Evento | Boss ou Throne — onde tem melhor KDA |
| Pior Evento | Onde tem pior KDA |
| Tendência | Comparação KDA últimas 5 partidas vs média geral (subindo/descendo/estável) |

**Classificação automática dos membros**:
- **MVP**: Top KDA + alta participação
- **Constante**: Baixo desvio padrão de KDA (confiável)
- **Oscilante**: Alto desvio padrão (imprevisível)
- **Destaque**: KDA acima da média da guild
- **Em Evolução**: Tendência positiva (últimas partidas melhorando)
- **Reserva**: Baixa participação em eventos

**Composição de equipe sugerida** (card visual):
- Monta automaticamente o "melhor time" com base em: KDA, consistência e participação
- Mostra composição por classe (ex: 2 BM, 1 SM, 1 DL, 1 ME)

**Insights IA por Guild**:
- Botão "Gerar Análise de Escalação" que chama a edge function `pvp-ai-insights` com dados específicos da guild
- Prompt especializado em análise tática: quem escalar, quem treinar, pontos fracos, composição ideal
- Reutiliza a mesma edge function existente, apenas com summary diferente

### Cálculos técnicos

**Consistência (desvio padrão)**:
- Para cada membro, calcular KDA por partida individual
- Desvio padrão desses KDAs = índice de oscilação
- Classificar: < 0.5 = Constante, 0.5-1.5 = Normal, > 1.5 = Oscilante

**Participação**:
- Total de matches no período filtrado (denominator)
- Matches em que o jogador aparece como killer ou victim (numerator)
- `participação = (matchesDoJogador / totalMatches) * 100`

**Tendência**:
- KDA das últimas 5 partidas vs KDA geral
- Se últimas 5 > geral * 1.1 → "Em alta"
- Se últimas 5 < geral * 0.9 → "Em baixa"
- Senão → "Estável"

**Melhor/Pior evento**:
- Separar logs por event_type do match
- Calcular KDA por tipo de evento

### Dados necessários

Precisa buscar `pvp_matches` com `event_type` junto ao `match_id` para separar por evento. Já temos `fetchFilteredMatchIds` — vamos estender `fetchKillLogsForMatches` para também retornar dados de match (ou buscar matches separadamente com event_type).

Adicionar campo `event_type` ao fetch de matches para que o TeamBuilder possa separar desempenho por tipo de evento. Criar nova função `fetchMatchesWithType` em `useAnalyticsData.ts`.

## Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `src/components/analytics/TeamBuilder.tsx` |
| Modificar | `src/components/analytics/PvPAnalyticsDashboard.tsx` — adicionar aba Escalação |
| Modificar | `src/hooks/useAnalyticsData.ts` — adicionar `fetchMatchesWithType()` |

## Fluxo do usuário

1. Admin abre "Análise PvP" → clica na aba "Escalação"
2. Seleciona sua guild no dropdown
3. Vê tabela com todos os membros e suas métricas avançadas
4. Badges coloridos indicam classificação (MVP, Constante, Oscilante, etc.)
5. Card "Composição Sugerida" mostra o melhor time automático
6. Botão "Gerar Insights IA" retorna análise tática personalizada da guild

