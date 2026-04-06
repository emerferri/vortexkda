

## Plano: Sorteador de Prêmios para LEGENDS/iLEGENDS

### Visão Geral
Nova aba "Sorteio" no menu lateral, acessível apenas para admin e moderador. Permite filtrar eventos por data/hora, listar participantes das guilds LEGENDS/iLEGENDS, sortear prêmios e postar resultado no webhook LEGENDS.

### Mudanças

#### 1. Nova aba no menu — `src/components/AppSidebar.tsx`
- Adicionar item `{ id: 'sorteio', label: 'Sorteio', icon: Gift, requiresEdit: true }` (visível para admin/moderador)

#### 2. Rota no Index — `src/pages/Index.tsx`
- Adicionar case `'sorteio'` no `renderContent()` renderizando o novo componente

#### 3. Novo componente — `src/components/LegendsSorteio.tsx`
- **Filtros**: Data de/até, hora de/até (mesmos filtros dos outros rankings)
- **Botão "Buscar Participantes"**: Consulta `pvp_matches` + `pvp_kill_logs` + `characters` para listar jogadores das guilds LEGENDS/iLEGENDS que participaram nos eventos filtrados
- **Lista de participantes**: Exibe os nomes encontrados com total de participações
- **Campo "Quantidade de prêmios"**: Input numérico
- **Botão "Sortear"**: Animação visual de embaralhamento dos nomes, seleciona N ganhadores aleatórios sem repetição, exibe resultado ordenado (1º, 2º, 3º...)
- **Post automático no Discord**: Ao finalizar o sorteio, chama a edge function `discord-webhook` com tipo `sorteio`, enviando participantes e ganhadores para o `DISCORD_WEBHOOK_URL_LEGENDS`

#### 4. Edge function — `supabase/functions/discord-webhook/index.ts`
- Novo handler para `type: 'sorteio'`
- Formata embed com:
  - Lista de participantes
  - Lista de ganhadores por ordem de sorteio (🥇 🥈 🥉 + numerados)
  - Filtros aplicados (período)
- Posta no `DISCORD_WEBHOOK_URL_LEGENDS`

### Lógica do sorteio
```text
1. Filtra matches por data/hora
2. Busca kill_logs dos matches filtrados
3. Cruza killer_name + victim_name com characters onde guild IN ('LEGENDS', 'iLEGENDS')
4. Lista única de participantes (sem duplicatas)
5. Ao sortear: shuffle aleatório → seleciona os N primeiros
6. Exibe resultado com animação → posta no Discord
```

### Arquivos afetados
- `src/components/AppSidebar.tsx` — nova aba
- `src/pages/Index.tsx` — novo case
- `src/components/LegendsSorteio.tsx` — componente novo
- `supabase/functions/discord-webhook/index.ts` — handler de sorteio

