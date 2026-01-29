
# Plano: Ranking Throne Conquest

## Resumo
Criar um novo sistema de ranking para o evento **Throne Conquest** que ocorre toda **terça-feira das 21:36 as 22:06 de Brasilia**, replicando as funcionalidades do Ranking Geral mas filtrando por um mapa diferente: **Devias - [Server: Boss Event PvP]**.

---

## O que vai mudar

### Nova aba no menu principal
Uma nova aba chamada **"Throne Conquest"** sera adicionada ao menu, visivel para todos os usuarios.

### Dados separados do Boss Event
- Os dados do Throne Conquest serao armazenados nas **mesmas tabelas** existentes (`pvp_matches`, `pvp_match_players`, `pvp_kill_logs`)
- Sera adicionada uma nova coluna para identificar o tipo de evento
- Os rankings serao filtrados pelo tipo de evento para exibir apenas dados relevantes

### Formato do log esperado
```
27/01/2026 22:05:56 - :dagger: **ViidaBoa** matou :skull: **LOGAN** no mapa :map: **Devias** - **[Server: Boss Event PvP]**
```

---

## Componentes a serem criados/modificados

### 1. Nova aba de Ranking
- Novo componente `RankingThroneConquest.tsx` baseado no `RankingGeral.tsx`
- Mesma estrutura visual e funcionalidades (filtros de data/hora, ordenacao, exportacao)
- Filtra dados apenas do evento Throne Conquest

### 2. Parser de logs atualizado
- Adicionar validacao para o mapa **"Devias - [Server: Boss Event PvP]"**
- Manter compatibilidade com o mapa existente do Boss Event

### 3. Importacao de dados (manual)
- O componente `Scoreboard.tsx` sera atualizado para identificar automaticamente o tipo de evento baseado no mapa
- Ao salvar, marcara o evento como "throne_conquest" ou "boss_event"

---

## Alteracoes no Banco de Dados

### Tabela: `pvp_matches`
Nova coluna:
- `event_type` (text, default: 'boss_event') - valores: 'boss_event' ou 'throne_conquest'

---

## Detalhes Tecnicos

### Arquivos a serem criados:
1. `src/components/RankingThroneConquest.tsx` - Componente de ranking (clone adaptado do RankingGeral)

### Arquivos a serem modificados:
1. `src/pages/Index.tsx` - Adicionar nova aba "Throne Conquest"
2. `src/utils/txtParser.ts` - Adicionar pattern para mapa Devias + retornar tipo de evento
3. `src/components/Scoreboard.tsx` - Salvar tipo de evento ao gravar no banco
4. `supabase/functions/auto-process-ranking/index.ts` - Suporte futuro para automacao do Throne Conquest

### Migracao SQL:
```sql
ALTER TABLE pvp_matches 
ADD COLUMN event_type text NOT NULL DEFAULT 'boss_event';
```

### Patterns de validacao do parser:
```javascript
// Throne Conquest - mapa Devias
const mapPatternDevias = /Devias\s*-\s*\[Server: Boss Event PvP\]/i;

// Boss Event - mapa PvP Square (existente)
const mapPatternPvPSquare = /PvP Square\s*-\s*\[Server: Boss Event PvP\]/i;
```

### Logica de identificacao do evento:
- Se o log contem mapa "Devias" -> event_type = 'throne_conquest'
- Se o log contem mapa "PvP Square" -> event_type = 'boss_event'

### Formato do boss_label para Throne Conquest:
```
throne 27/01 21 horas
```

---

## Sequencia de Implementacao

1. **Migracao do banco** - Adicionar coluna `event_type`
2. **Parser** - Adicionar suporte ao mapa Devias e retornar tipo de evento
3. **Scoreboard** - Atualizar para salvar o tipo de evento
4. **RankingThroneConquest** - Criar componente de ranking
5. **Index** - Adicionar nova aba no menu
6. **Teste** - Importar dados do Throne Conquest e verificar ranking

---

## Automacao Futura (nao incluso neste plano)
A automacao via Edge Function (`auto-process-ranking`) podera ser expandida futuramente para:
- Processar logs do Throne Conquest automaticamente toda terca-feira as 22:10
- Postar no Discord com formato similar ao Boss Event

Isso seria uma segunda fase apos validar o funcionamento manual.
