# 99Food — etapa 2: adaptador de fixtures isolado

## Fontes e escopo

O portal oficial da 99Food informa suporte a sandbox e à API de pedidos:
https://developer-food.99app.com/

A ficha da 99Food no Open Delivery informa recebimento de eventos por
webhook ou polling e ambiente de sandbox:
https://aderentes.opendelivery.com.br/companies/68f696345e89f79a1563008a

**IMPORTANTE:** o contrato de JSON sintético `shifuh-99food-sandbox-v1`
foi criado exclusivamente pelo Shifuh para testes. Ele **não representa** o
payload oficial da 99Food. Nenhum endpoint, assinatura ou estado nativo da API
da 99Food foi inferido ou implementado nesta entrega.

## Entregue

- `src/lib/99food/sandbox-adapter.ts`: valida payload sintético com
  allowlist estrita de campos, versão explícita, vínculo seguro do merchant
  ao restaurante fornecido pelo servidor e mapeamento de status.
- `src/lib/marketplaces/event-ingestion.ts`: contrato de ingestão com
  armazenamento atômico injetado; não cria tabelas, consulta serviços ou
  envia ACK ao provedor.
- `tests/99food-sandbox-adapter.test.cjs`: testes de contrato e mocks,
  colisões, redelivery em concorrência e isolamento entre canais/tenants.

O armazenamento simulado nos testes serializa decisões na memória para
exercitar o contrato. Isto **não é garantia** de idempotência durável em
múltiplos workers/processos. Não há adapter Postgres neste PR.

## Bloqueios antes de produção

1. Confirmar o contrato oficial de eventos, assinatura/verificação,
   autenticação, merchant, mapeamento de status e ACK no portal de parceiros
   com aplicativo de sandbox autorizado.
2. Criar adaptador real separado do adaptador de fixtures; fazer rejeição
   de assinatura/merchant desconhecido antes de aceitar conteúdo de evento.
3. Implementar persistência durável com índices únicos e transações por
   (restaurante, canal, pedido/evento); validar corrida de workers no
   Supabase **local** antes de propor migrations.
4. Confirmar semântica e ordenação de eventos, cancelamentos e operações
   externas oficiais; ACK somente após persistência bem-sucedida.
5. Implementar UI e fluxos de restaurante somente após homologação,
   mantendo o código iFood existente independente.

Nesta etapa não se criaram rotas públicas, cron, chamadas de rede, ações
reais ou modificações na infraestrutura Vercel/Supabase/CI.
