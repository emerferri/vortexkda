
# Plano: Ranking Throne Conquest ✅ CONCLUÍDO

## Resumo
Sistema de ranking para o evento **Throne Conquest** que ocorre toda **terça-feira das 21:36 as 22:06 de Brasilia**, replicando as funcionalidades do Ranking Geral mas filtrando pelo mapa **Devias - [Server: Boss Event PvP]**.

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

---

## Formato do Log Suportado
```
27/01/2026 22:05:56 - :dagger: **ViidaBoa** matou :skull: **LOGAN** no mapa :map: **Devias** - **[Server: Boss Event PvP]**
```

---

## Automação Futura (não incluso)
A automação via Edge Function pode ser expandida futuramente para:
- Processar logs do Throne Conquest automaticamente toda terça-feira às 22:10
- Postar no Discord com formato similar ao Boss Event
