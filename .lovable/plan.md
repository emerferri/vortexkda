

# Frases sem Repetir - Rotacao Completa

## Problema Atual
A selecao de frases usa `dayOfYear % total_frases`, o que pode repetir frases antes de todas serem usadas (ex: com 3 frases, dia 1 e dia 4 usam a mesma).

## Solucao
Adicionar um campo `last_used_at` na tabela `discord_highlight_phrases`. Na hora de selecionar a frase, escolher a que tem o `last_used_at` mais antigo (ou NULL = nunca usada). Apos usar, marcar com a data/hora atual. Assim, todas as frases sao usadas antes de qualquer uma repetir.

## Alteracoes

### 1. Migracao de banco de dados
Adicionar coluna `last_used_at` (timestamp, nullable, default NULL) na tabela `discord_highlight_phrases`.

### 2. Edge Function `auto-process-ranking/index.ts`
Alterar a logica de selecao de frases (linhas ~734-761):

**Antes:** busca todas as frases e usa `dayOfYear % length`

**Depois:**
- Para cada categoria (`kill_streak`, `best_kda`, `cone`), buscar a frase com `last_used_at` mais antigo (NULLs primeiro)
- Usar essa frase
- Atualizar o `last_used_at` dessa frase para `now()`
- Quando todas as frases de uma categoria ja foram usadas, a proxima selecao pega a mais antiga, reiniciando o ciclo naturalmente

```text
Fluxo:
1. SELECT da frase com last_used_at IS NULL (prioridade) ou ORDER BY last_used_at ASC
2. Usar a frase selecionada
3. UPDATE last_used_at = NOW() nessa frase
4. Repete para cada categoria
```

### 3. Tipo TypeScript (automatico)
A coluna `last_used_at` sera refletida automaticamente no types.ts apos a migracao.

## Detalhes tecnicos

### Query de selecao por categoria
```sql
SELECT * FROM discord_highlight_phrases
WHERE category = 'kill_streak'
ORDER BY last_used_at ASC NULLS FIRST
LIMIT 1
```

### Funcao `selectPhrase` atualizada
Em vez de calcular pelo dia do ano, a funcao fara uma query individual por categoria, selecionando a frase menos recentemente usada e atualizando-a apos o uso. Isso garante que com N frases, as N primeiras postagens usem frases diferentes.

