

# Ranking: Nunca Tiveram KDA Positivo

## O que sera feito
Criar um novo ranking que mostra os personagens que **nunca** tiveram KDA positivo (KDA > 0) em nenhuma partida de Boss Event. Ou seja, em todas as partidas que participaram, o KDA foi sempre 0 ou negativo.

## Como funciona a logica
1. Buscar todos os registros de `pvp_match_players` filtrados por partidas do tipo `boss_event`
2. Agrupar por jogador
3. Filtrar apenas os jogadores onde o **KDA maximo** entre todas as partidas foi <= 0
4. Ordenar por quantidade de partidas (quem participou mais vezes e nunca teve KDA positivo fica no topo - maior "merito")

## Alteracoes

### 1. Novo componente: `src/components/NeverPositiveKDA.tsx`
- Seguir o padrao visual do `MuralDaVergonha` (Card, Table, filtros de data/hora, export Excel/Imagem)
- Colunas: Rank, Jogador, Classe, Guild, Partidas, Melhor KDA, Total Kills, Total Deaths
- Badge de "nivel" baseado na quantidade de partidas sem KDA positivo
- Icone tematico (ex: TrendingDown ou ThumbsDown)

### 2. Adicionar na sidebar (`AppSidebar.tsx`)
- Novo item no menu: `{ id: 'never-positive', label: 'Nunca Positivo', icon: TrendingDown }`
- Posicionar proximo ao "Mural da Vergonha"

### 3. Adicionar rota no `Index.tsx`
- Novo case no `renderContent()`: `case 'never-positive': return <NeverPositiveKDA />`

## Detalhes tecnicos

### Query de dados
```text
1. Buscar match IDs do tipo boss_event (com filtros de data/hora opcionais)
2. Buscar pvp_match_players para esses match IDs
3. Agrupar por player_name
4. Para cada jogador, verificar se MAX(kda) <= 0
5. Se sim, incluir no ranking
6. Ordenar por partidas jogadas DESC (mais partidas = mais "persistencia")
```

### Niveis tematicos
- 10+ partidas: "Imbativel no Negativo"
- 5+ partidas: "Persistente"
- 3+ partidas: "Dedicado"
- Menos: "Iniciante"

