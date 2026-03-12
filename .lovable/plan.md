

## Plano: Desempenho como Prioridade na Escalação

### Problema Atual
A lógica atual prioriza pools (A→B→C) na ordem, então um piloto disponível com score baixo entra antes de um personagem sem piloto com score alto. O correto é: **desempenho sempre manda**, piloto disponível só serve como desempate.

### Nova Lógica

```text
1. Ordena TODOS por score (desc)
2. Preenche o time na ordem de score
3. Se dois jogadores têm score parecido (diferença < 5%):
   → Prefere quem tem piloto disponível (available > no_pilot > unavailable)
4. Quem ficar fora vai para reserva, mesmo com piloto na lista
```

### Mudança em `TeamBuilder.tsx` — função `selectTeamByPools`

Substituir a lógica de pools separados por uma ordenação única por score, usando `pilotStatus` apenas como critério de desempate quando scores são similares (diferença < 5% do score maior).

```typescript
// Pseudo-código da nova lógica
scored.sort((a, b) => {
  const diff = Math.abs(a.score - b.score);
  const threshold = Math.max(a.score, b.score) * 0.05;
  if (diff <= threshold) {
    // Desempate por disponibilidade do piloto
    const priority = { available: 0, no_pilot: 1, unavailable: 2 };
    return priority[a.pilotStatus] - priority[b.pilotStatus];
  }
  return b.score - a.score;
});
const team = scored.slice(0, maxSize);
const reserves = scored.slice(maxSize);
```

### Arquivo Afetado
- `src/components/analytics/TeamBuilder.tsx` — refatorar `selectTeamByPools`

