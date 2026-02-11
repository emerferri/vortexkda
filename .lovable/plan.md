
# Plano: Ranking Throne Conquest ✅ CONCLUÍDO

## Resumo
Sistema de ranking para o evento **Throne Conquest** que ocorre toda **terça-feira das 21:36 às 22:06 de Brasília**, replicando as funcionalidades do Ranking Geral mas filtrando pelo mapa **Devias - [Server: Boss Event PvP]**.

---

## Regras de Mapas (CRÍTICO)
- **Boss Event**: SEMPRE no mapa **PvP Square - [Server: Boss Event PvP]**
  - Segunda: 21:00 e 22:00
  - Terça/Quinta: 20:00 e 22:30
  - Demais dias: 20:00 e 22:00
- **Throne Conquest**: SEMPRE no mapa **Devias - [Server: Boss Event PvP]**
  - Somente terça-feira: 21:36 às 22:36

---

## Implementação Concluída

### ✅ Migração do Banco de Dados
- Adicionada coluna `event_type` (text, default: 'boss_event') na tabela `pvp_matches`
- Valores aceitos: 'boss_event' ou 'throne_conquest'

### ✅ Parser Atualizado (`src/utils/txtParser.ts`)
- Adicionado suporte ao mapa Devias com todos os formatos de asteriscos
- Detecta automaticamente o tipo de evento baseado no mapa
- Gera label correto: "throne DD/MM HH horas"

### ✅ Scoreboard Atualizado (`src/components/Scoreboard.tsx`)
- Salva o `event_type` corretamente ao gravar no banco
- Detecta evento pelo prefixo do label (boss/throne)

### ✅ Novo Componente (`src/components/RankingThroneConquest.tsx`)
- Interface visual similar ao Ranking Geral
- Filtra apenas eventos do tipo `throne_conquest`
- Cards especiais: Rei do Throne, Brabissimo, KDA/Médio, Cone Monodedo
- Suporte a filtros de data e classe
- Exportação Excel/JPG
- Publicação no Discord

### ✅ Nova Aba no Menu (`src/pages/Index.tsx`)
- Aba "Throne" com ícone de coroa adicionada
- Visível para todos os usuários

### ✅ Edge Function auto-process-ranking (Atualizado 04/02/2026)
- Suporte ao parâmetro `eventType: 'boss_event' | 'throne_conquest'`
- Parser separado para Boss (PvP Square) e Throne (Devias)
- Seleção automática de webhook baseado no tipo de evento:
  - Boss: `DISCORD_WEBHOOK_URL_PROD`
  - Throne: `DISCORD_WEBHOOK_URL_THRONE`
- Verificação de duplicatas por `match_date + match_hour + event_type`

---

## Formato do Log Suportado
```
27/01/2026 22:05:56 - :dagger: **ViidaBoa** matou :skull: **LOGAN** no mapa :map: **Devias** - **[Server: Boss Event PvP]**
```

---

## Cron Jobs para Throne Conquest (Pendente)
Para automatizar o Throne Conquest às terças-feiras:
- T1: 22:40 UTC-3 (01:40 UTC quarta) - primeira tentativa
- T2: 22:45 UTC-3 (01:45 UTC quarta) - segunda tentativa
- T3: 22:50 UTC-3 (01:50 UTC quarta) - processamento forçado

Payload esperado:
```json
{"eventHour": 21, "eventMinute": 36, "eventType": "throne_conquest", "trigger": "cron", "attempt": 1}
```
