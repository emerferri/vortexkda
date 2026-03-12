

## Plano: Campo "Piloto" nos Personagens + Importação de Lista de Pilotos na Escalação

### Contexto
Cada personagem no jogo é controlado por um "piloto" (pessoa real). Atualmente não há essa associação no sistema. O objetivo é:
1. Adicionar o campo `pilot_name` na tabela `characters`
2. Permitir cadastrar/editar o piloto no gerenciamento de personagens e na importação em massa
3. Na Escalação (Team Builder), permitir importar uma lista de pilotos disponíveis (TXT ou Excel), cruzar com os personagens cadastrados, e sugerir a formação apenas com os pilotos presentes

### Mudanças Planejadas

#### 1. Migração de Banco de Dados
- Adicionar coluna `pilot_name TEXT DEFAULT ''` na tabela `characters`
- Coluna nullable/com default vazio para não quebrar dados existentes

#### 2. CharacterManagement.tsx — Formulário de cadastro/edição
- Adicionar campo "Piloto" no formulário (dialog)
- Adicionar coluna "Piloto" na tabela de listagem
- Atualizar schema zod e lógica de insert/update para incluir `pilot_name`

#### 3. CharacterImport.tsx — Importação em massa
- Aceitar coluna "Piloto" / "Pilot" no Excel/TXT/CSV
- Incluir `pilot_name` no upsert durante importação

#### 4. TeamBuilder.tsx — Importação de lista de pilotos disponíveis
- Adicionar área de importação de lista (textarea para colar nomes ou upload de arquivo TXT/Excel)
- A lista contém apenas nomes dos pilotos disponíveis para o evento
- Ao importar, o sistema cruza `pilot_name` dos personagens da guild selecionada com a lista
- Personagens cujo piloto está na lista são marcados como "Disponível"
- A sugestão de formação considera apenas personagens com piloto disponível
- Pilotos da lista sem personagem associado são mostrados como "Sem personagem cadastrado"
- Personagens sem piloto definido são sinalizados

#### 5. Fluxo do Usuário na Escalação
```text
1. Seleciona guild no filtro superior
2. Cola/importa lista de pilotos disponíveis
3. Sistema cruza pilotos ↔ personagens
4. Mostra: pilotos disponíveis com seus chars, pilotos sem char, chars sem piloto
5. Gera formação sugerida apenas com pilotos disponíveis
```

### Arquivos Afetados
- **Migração SQL**: nova coluna `pilot_name` em `characters`
- `src/components/CharacterManagement.tsx`: campo piloto no CRUD
- `src/components/CharacterImport.tsx`: coluna piloto na importação em massa
- `src/components/analytics/TeamBuilder.tsx`: importação de lista + cruzamento + formação filtrada
- `src/hooks/useAnalyticsData.ts`: incluir `pilot_name` no `CharacterInfo` e `fetchAllCharacters`

