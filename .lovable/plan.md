

## Problema

O componente que está sendo exibido na tela é `Characters.tsx`, não `CharacterManagement.tsx`. O `Characters.tsx` possui seu próprio dialog de edição/criação que **não foi atualizado** com o campo "Piloto".

## Correções em `src/components/Characters.tsx`

1. **`formData` state** (linha 37): Adicionar `pilot_name: ''` ao objeto inicial
2. **`openEditDialog`** (linha 277): Incluir `pilot_name: character.pilot_name || ''`
3. **`openAddDialog`** (linha 283): Incluir `pilot_name: ''`
4. **Reset após submit** (linha 169): Incluir `pilot_name: ''`
5. **Dialog form** (após linha 670): Adicionar campo Input para "Piloto" antes do `DialogFooter`
6. **handleSubmit**: Incluir `pilot_name` no insert/update do Supabase
7. **Tabela de listagem** (linha 695): Adicionar coluna "Piloto" na tabela

