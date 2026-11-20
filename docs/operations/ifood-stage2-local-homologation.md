# iFood — etapa 2 de homologação (somente testes locais)

## Escopo
Validar **receber → persistir → ACK → confirmar** no Shifuh antes de gerar
pedidos oficiais pelo iFood Developer. Este documento NÃO autoriza testes na API real.

Código: `scripts/ifood-stage2-local-homologation.cjs`.
O Commercial E2E existente executará o script apenas quando houver uma execução
regular de CI autorizada em PR; não disparar `workflow_dispatch`.

## Isolamento inegociável
- Banco deve ser Supabase **local** (`localhost` ou `127.0.0.1`). Nunca usar projeto remoto.
- O fornecedor iFood é **100% mockado**: sem Client ID, Client Secret,
  token OAuth real ou endpoint remoto.
- `IFOOD_PERSISTED_REPLAY_ENABLED=false`, sem agendadores e sem cron externo.
- Teste usa **merchant e pedido sintéticos**, não o ID da loja real de teste
  `7e1a2e9a-f621-40e1-9966-f625f886d611`.
- Nenhuma ação de confirmação, despacho, cancelamento ou ACK é enviada ao iFood.
- Nenhum deploy, Preview, merge ou migração remota é necessário.

## Como validar em ambiente descartável autorizado
1. Iniciar Supabase local e resetar o banco **local** (`supabase start`,
   `supabase db reset`), usando a mesma fixture de teste do Commercial E2E.
2. Exportar **apenas** as variáveis locais `NEXT_PUBLIC_SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY` fornecidas pelo Supabase local.
3. Garantir ausência de `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` e
   `IFOOD_AUTH_URL`. Usar `IFOOD_PERSISTED_REPLAY_ENABLED=false`.
4. Executar:
   ```sh
   IFOOD_STAGE2_LOCAL_E2E=1 IFOOD_PERSISTED_REPLAY_ENABLED=false node scripts/ifood-stage2-local-homologation.cjs
   ```
5. Exigir saída `PASS ifood stage2 local` e os seguintes resultados:
   recebido=1, processado=1, ACK=1 somente depois da persistência,
   confirmação mock=1, pedidos duplicados=0, ACKs duplicados=0.
6. Conferir limpeza das linhas sintéticas. Se falhar, NÃO avançar à
   geração de pedidos reais.

## Limites
Este teste exercita o sincronizador real com Supabase local, mas substitui
as respostas e o transporte iFood por mocks. Não comprova a confirmação
nem o ACK perante o iFood Developer. O teste de OAuth, Merchant ID e
polling oficiais anterior foi realizado separadamente pelo usuário no
Windows; ainda não comprova o fluxo funcional de pedidos.

Antes de gerar pedidos oficiais, executar a matriz local, revisar a evidência
e receber autorização específica para ações na loja de homologação.
