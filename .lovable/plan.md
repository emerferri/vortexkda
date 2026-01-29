

# Plano: Expandir Resumo por Guild com Estatísticas Completas

## Objetivo
Transformar o resumo simples de contagem de jogadores por guild em uma tabela completa com kills, deaths e score da guild, seguindo o mesmo formato visual do ranking de jogadores.

---

## Estado Atual

O resumo por guild atualmente mostra apenas:
```text
⚔️ Resumo por Guild
PHOENIX: 18 jogadores 
BADBOYS: 5 jogadores
OsGoDs: 5 jogadores
```

---

## Novo Formato Proposto

Transformar em uma tabela formatada semelhante ao ranking de jogadores:

```text
⚔️ RANKING POR GUILD
═══════════════════════════════════════════════════

 Pos  Guild               Jogadores    K     D    Score
────────────────────────────────────────────────────
 🥇  PHOENIX                    18   125    87   292.50
 🥈  BADBOYS                     5    42    35   112.30
 🥉  OsGoDs                      5    38    40    89.20
 #4  MARVEL                      4    28    32    65.00
 #5  TITANS                      1     8    12    18.00
```

---

## Cálculo do Score da Guild

Usando a mesma fórmula do score individual, aplicada à soma dos jogadores:

```typescript
guildScore = (totalKills * 3) + (totalKDA * 2) - (totalDeaths * 1.5)

// Onde totalKDA = totalKills / totalDeaths (ou totalKills se deaths = 0)
```

---

## Alterações Necessárias

### 1. Criar Função `formatGuildRankingTable`

Nova função similar à `formatRankingTable`, mas para guilds:

```typescript
function formatGuildRankingTable(guilds: Array<{
  guild: string, 
  playerCount: number, 
  kills: number, 
  deaths: number, 
  score: number
}>): string {
  const maxGuildLen = Math.max(5, ...guilds.map(g => g.guild.length));
  
  let table = '⚔️ RANKING POR GUILD\n';
  table += '═'.repeat(55) + '\n\n';
  table += ' Pos  ' + 'Guild'.padEnd(maxGuildLen + 2) + 'Jogadores    K     D    Score\n';
  table += '─'.repeat(55) + '\n';
  
  guilds.forEach((guild, index) => {
    const pos = index + 1;
    let posStr: string;
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const guildStr = guild.guild.padEnd(maxGuildLen + 2);
    const playersStr = guild.playerCount.toString().padStart(9);
    const killsStr = guild.kills.toString().padStart(5);
    const deathsStr = guild.deaths.toString().padStart(5);
    const scoreStr = guild.score.toFixed(2).padStart(9);
    
    table += `${posStr} ${guildStr}${playersStr}${killsStr}${deathsStr}${scoreStr}\n`;
  });
  
  return table;
}
```

### 2. Modificar Cálculo do `guildSummary`

Expandir a estrutura de dados para incluir todas as estatísticas:

```typescript
// Antes (linha 483-488):
const guildSummary: Record<string, number> = {};
for (const player of nonBannedPlayers) {
  const charInfo = characterMap[player.name];
  const guild = charInfo?.guild || 'Sem Guild';
  guildSummary[guild] = (guildSummary[guild] || 0) + 1;
}

// Depois:
interface GuildStats {
  playerCount: number;
  kills: number;
  deaths: number;
}

const guildSummary: Record<string, GuildStats> = {};
for (const player of nonBannedPlayers) {
  const charInfo = characterMap[player.name];
  const guild = charInfo?.guild || 'Sem Guild';
  if (!guildSummary[guild]) {
    guildSummary[guild] = { playerCount: 0, kills: 0, deaths: 0 };
  }
  guildSummary[guild].playerCount++;
  guildSummary[guild].kills += player.kills;
  guildSummary[guild].deaths += player.deaths;
}
```

### 3. Calcular Score e Ordenar Guilds

```typescript
const guildsWithScore = Object.entries(guildSummary).map(([guild, stats]) => {
  const guildKDA = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
  const score = (stats.kills * 3) + (guildKDA * 2) - (stats.deaths * 1.5);
  return { guild, ...stats, score };
});

const sortedGuilds = guildsWithScore.sort((a, b) => b.score - a.score);
const guildRankingText = formatGuildRankingTable(sortedGuilds);
```

### 4. Atualizar Embed do Discord

Modificar o campo "Resumo por Guild" para usar o novo formato:

```typescript
{
  name: '⚔️ Ranking por Guild',
  value: '```\n' + guildRankingText.substring(0, 1000) + '\n```',
  inline: false,
}
```

---

## Simulação do Resultado

Baseado nos dados típicos de um evento:

```text
⚔️ RANKING POR GUILD
═══════════════════════════════════════════════════════

 Pos  Guild               Jogadores    K     D    Score
───────────────────────────────────────────────────────
 🥇  PHOENIX                    18   125    87   305.37
 🥈  BADBOYS                     5    42    35    98.90
 🥉  OsGoDs                      5    38    40    75.90
 #4  MARVEL                      4    28    32    49.75
 #5  TITANS                      1     8    12     8.33
 #6  Sem Guild                   3    15    20    21.50
```

---

## Detalhes Técnicos

**Arquivo a modificar:** `supabase/functions/auto-process-ranking/index.ts`

**Alterações:**
1. Adicionar interface `GuildStats` (após linha 30)
2. Adicionar função `formatGuildRankingTable` (após `formatRankingTable`, ~linha 69)
3. Modificar bloco de cálculo do `guildSummary` (linhas 483-488)
4. Adicionar cálculo de score e ordenação (após linha 488)
5. Atualizar formatação do resumo (linhas 516-520)
6. Modificar o embed field para usar code block com a tabela (linhas 568-571)

**Limite de caracteres:** O campo do embed tem limite de ~1024 caracteres, então a tabela será truncada se necessário, mas tipicamente 5-8 guilds cabem facilmente.

