
# Indicador Classe x Classe (Class Matchup)

## Objetivo
Criar uma nova tela que mostra a vantagem de cada classe sobre as outras, baseada nos logs de kills (`pvp_kill_logs`). Para cada classe, exibir quantas vezes matou/morreu para cada classe adversaria, com percentual e grafico.

## Fonte de dados
- `pvp_kill_logs` (~18.430 registros): fornece `killer_name` e `victim_name`
- `characters`: fornece a `class` de cada jogador (excluindo banidos)
- Cruzamento: normalizar nomes e fazer lookup da classe do killer e da vitima

## Novo componente: `src/components/ClassMatchup.tsx`

### Logica principal
1. Buscar todos os `pvp_kill_logs` (com paginacao de 1000)
2. Buscar todos os `characters` (name, class, banned=false)
3. Para cada kill log, resolver a classe do killer e da vitima
4. Ignorar logs onde killer ou vitima nao tem classe cadastrada
5. Agregar em uma matriz: `classA matou classB = N vezes`
6. Calcular percentuais: do total de kills de classA, qual % foi contra cada classe

### Interface
- **Seletor de classe**: dropdown para escolher uma classe especifica ou ver todas
- **Modo de visualizacao**:
  - Tabela com colunas: Classe Atacante, Classe Alvo, Kills, % do Total
  - Grafico de barras horizontais (Recharts BarChart) mostrando distribuicao de kills por classe alvo
- **Filtro de data**: campos de data inicio/fim (reutilizando padrao existente)
- **Exportar**: botoes para Excel e imagem (seguindo padrao do ClassGuildRanking)

### Layout visual
Ao selecionar uma classe:
- Card com titulo "Lord Emperor vs Outras Classes"
- Grafico de barras horizontal mostrando kills contra cada classe adversaria
- Tabela abaixo com: Classe Alvo | Kills Realizadas | Mortes Sofridas | Saldo | Win Rate %

## Alteracoes nos arquivos

### Novo arquivo
- `src/components/ClassMatchup.tsx` - componente completo

### Arquivos editados
- `src/pages/Index.tsx` - adicionar case 'classe-matchup' no renderContent
- `src/components/AppSidebar.tsx` - adicionar item de navegacao "Classe x Classe" com icone Crosshair, posicionado apos "Melhor por Classe"

## Detalhes tecnicos

### Paginacao dos kill logs
Os ~18.430 registros precisam de paginacao com `.range()` em blocos de 1000, igual ao padrao ja usado em outros componentes.

### Estrutura de dados
```text
Map<string, Map<string, { kills: number, deaths: number }>>
  killerClass -> victimClass -> { kills, deaths }
```

### Grafico
Usar `BarChart` horizontal do Recharts (ja instalado), com barras coloridas por classe alvo. Reutilizar a paleta de cores `COLORS` do ClassGuildRanking.

### Normalizacao de nomes
Usar NFKC + collapse spaces + trim + lowercase, mesmo padrao dos outros componentes.
