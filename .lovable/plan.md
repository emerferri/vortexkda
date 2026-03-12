

## Plano: Escalação Inteligente com Pilotos e Métricas

### Problema Atual
A lógica atual simplesmente filtra: se o piloto está na lista, o personagem entra; se não, fica fora. Não há avaliação de desempenho para decidir se o piloto deveria ser titular ou reserva.

### Nova Lógica de Escalação

```text
1. Importa lista de pilotos disponíveis
2. Cruza pilotos ↔ personagens (pilot_name)
3. Calcula score de TODOS os personagens da guild
4. Monta o time usando 3 pools, nesta prioridade:
   Pool A: Personagens com piloto na lista (disponíveis)
   Pool B: Personagens sem piloto definido (livres)
   Pool C: Sobra dos pools acima
5. Dentro de cada pool, ordena por score (KDA, consistência, participação)
6. Preenche o time até o limite (25 ou 20 para Arka War)
7. Quem ficar fora (mesmo com piloto na lista) vai para RESERVA
   → O sistema mostra explicitamente: "Piloto X está disponível mas seu personagem Y ficou como reserva por desempenho inferior"
```

### Mudanças em `TeamBuilder.tsx`

1. **Remover o filtro excludente** — `effectiveMembers` não vai mais excluir quem não tem piloto na lista; vai apenas marcar disponibilidade
2. **Adicionar propriedade `pilotStatus`** a cada membro: `'available'` (piloto na lista), `'no_pilot'` (sem piloto definido), `'unavailable'` (piloto não está na lista)
3. **Nova lógica de `suggestedTeam`**:
   - Ordena todos por score
   - Prioriza Pool A (available), depois Pool B (no_pilot) para preencher vagas
   - Quem não entrar vai para lista de reservas com motivo
4. **Nova lógica de `arkaWarParties`**: mesma priorização por pools
5. **UI de resultado**: mostrar badges visuais (Titular / Reserva por Desempenho / Piloto Indisponível), e seção "Reservas com piloto disponível" destacada

### Arquivos Afetados
- `src/components/analytics/TeamBuilder.tsx` — refatorar lógica de seleção e UI

