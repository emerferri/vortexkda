
# Plano: Adicionar Classe na Tabela do Ranking Discord

## Objetivo
Modificar a Edge Function `auto-process-ranking` para incluir a coluna **Classe** na tabela do ranking postada no Discord, e em seguida repostar o ranking das 21:00 de hoje (27/01).

---

## Análise Atual

A função já busca os dados de classe dos personagens (linha 464-466):
```typescript
const { data: characters } = await internalClient
  .from('characters')
  .select('name, guild, class, banned')
  .in('name', playerNames);
```

Porém, a função `formatRankingTable` (linhas 42-72) atualmente formata apenas:
- Posição, Jogador, K, D, KDA, Score

---

## Alterações Necessárias

### 1. Atualizar Interface e Função `formatRankingTable`

Modificar a função para aceitar classe e incluir a coluna na tabela:

**Novo formato da tabela:**
```text
🏆 RANKING PVP
════════════════════════════════════════════════════════════════

 Pos  Jogador              Classe               K    D    KDA     Score
────────────────────────────────────────────────────────────────
 🥇  PlayerName           Force Emperor       25    5   5.00     72.50
 🥈  PlayerTwo            Infinity Rune W...  20    8   2.50     55.00
 🥉  PlayerThree          Knight              18   10   1.80     42.60
```

### 2. Passar dados de classe ao formatar

Na construção de `playersWithScore` (linha 526), incluir a classe do `characterMap`:

```typescript
const playersWithScore = nonBannedPlayers.map(player => {
  const eventScore = (player.kills * 3) + (player.kda * 2) - (player.deaths * 1.5);
  const charInfo = characterMap[player.name];
  return { 
    ...player, 
    eventScore,
    class: charInfo?.class || '—'
  };
});
```

### 3. Truncar nomes de classe longos

Para evitar quebra de layout no Discord, truncar classes muito longas (ex: "Infinity Rune Wizard" para "Infinity Rune W...").

---

## Simulação do Resultado

Baseado nos dados reais do evento 27/01 às 21:00:

```text
🏆 RANKING PVP
════════════════════════════════════════════════════════════════════════════

 Pos  Jogador              Classe               K    D    KDA     Score
────────────────────────────────────────────────────────────────────────────
 🥇  Oneka                Force Emperor       25   11   2.27     67.98
 🥈  Yosaghi              Force Emperor       24    9   2.67     66.84
 🥉  Vorgue               Infinity Rune W...  22   10   2.20     56.90
 #4  Tsjelly              Infinity Rune W...  19    9   2.11     47.72
 #5  Luslayer             Knight              18   12   1.50     36.00
 ...
```

**Caracteres estimados:** ~2.500 (dentro do limite de 4.000 do Discord)

---

## Etapas de Implementação

1. **Modificar `formatRankingTable`**
   - Adicionar parâmetro `class` na interface do player
   - Calcular largura dinâmica para coluna Classe
   - Truncar nomes de classe > 18 caracteres

2. **Atualizar construção de `playersWithScore`**
   - Incluir classe do `characterMap`

3. **Deploy da Edge Function**
   - Fazer deploy automático da função atualizada

4. **Repostar Ranking 21:00**
   - Deletar o match existente de 27/01 às 21:00
   - Disparar processamento forçado para recriar e postar

---

## Detalhes Técnicos

**Arquivo a modificar:** `supabase/functions/auto-process-ranking/index.ts`

**Função `formatRankingTable` atualizada:**
```typescript
function formatRankingTable(players: Array<{
  name: string, 
  kills: number, 
  deaths: number, 
  kda: number, 
  eventScore: number,
  class?: string
}>): string {
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  const maxClassLen = Math.min(18, Math.max(6, ...players.map(p => (p.class || '—').length)));
  
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(60 + maxNameLen) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + 'Classe'.padEnd(maxClassLen + 2) + '  K    D    KDA     Score\n';
  table += '─'.repeat(60 + maxNameLen) + '\n';
  
  players.forEach((player, index) => {
    const pos = index + 1;
    let posStr: string;
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    let classStr = player.class || '—';
    if (classStr.length > maxClassLen) {
      classStr = classStr.substring(0, maxClassLen - 3) + '...';
    }
    
    const nameStr = player.name.padEnd(maxNameLen + 2);
    const classDisplay = classStr.padEnd(maxClassLen + 2);
    // ... resto igual
  });
  
  return table;
}
```

**Processo de repostagem:**
1. Deletar match de `pvp_matches` onde `match_date = '2025-01-27'` e `match_hour = 21`
2. Chamar edge function com `{ attempt: 3, forceProcess: true, eventHour: 21 }`
