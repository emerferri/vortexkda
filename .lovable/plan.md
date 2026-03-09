

# Página de Manutenção

## O que será feito
Criar uma página de manutenção que será exibida para todos os usuários que **não são admin**. Admins continuam acessando o site normalmente.

## Abordagem
1. **Modificar `src/pages/Index.tsx`**: Adicionar uma verificação de role. Se o usuário não for admin, renderizar a tela de manutenção em vez do conteúdo normal.
2. **Tela de manutenção**: Ícone de ferramenta/engrenagem (Wrench do Lucide), mensagem centralizada com visual consistente ao tema dark do site.
3. **Admins**: Continuam vendo o site completo com sidebar e todos os rankings.

## Componentes
- Usar `Wrench` icon do lucide-react
- Layout centralizado com a mensagem: *"Site em manutenção, realizando melhorias sugeridas pelo Bica!"*
- Manter o hook `useUserRole` já existente para checar `isAdmin`

## Arquivos modificados
- `src/pages/Index.tsx` — adicionar check de manutenção antes de renderizar conteúdo

