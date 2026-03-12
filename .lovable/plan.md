

## Plano: Adicionar Coluna de Pontuação no Scoreboard

### O que será feito
Adicionar a coluna **Pontuação** na tabela do Scoreboard (tela de Incluir Dados), usando a mesma fórmula dos rankings: `(kills × 3) + (KDA × 2) - (deaths × 1.5)`.

### Mudanças em `src/components/Scoreboard.tsx`

1. **Adicionar `score` como opção de ordenação** — incluir `'score'` no tipo `SortKey`
2. **Calcular o score** para cada jogador no `sortedPlayers` usando a fórmula padrão
3. **Adicionar coluna "Pontuação"** no `<thead>` e `<tbody>` da tabela, com ícone e estilo visual consistente
4. **Adicionar botão de ordenação** por Pontuação nos filtros
5. **Incluir no export Excel** a coluna de pontuação
6. **Ordenação padrão** passa a ser por `score` (mais relevante)

### Fórmula
```text
Score = (kills × 3) + (kda × 2) - (deaths × 1.5)
```

### Arquivo Afetado
- `src/components/Scoreboard.tsx`

