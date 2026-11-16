# Integrações multicanal — etapa 1 (iFood e 99Food)

## Auditoria de entrada

- O iFood já possui cliente HTTP, polling de eventos, busca de detalhes, sincronização
  de pedidos, confirmação/ACK e recuperação de falhas. **Não substituir** esses
  fluxos nesta etapa.
- O iFood usa armazenamento próprio de eventos, leases e guardas de status.
  A migração para um armazenamento neutro exige planejamento e testes SQL
  específicos com Supabase local.
- A 99Food ainda não possui adaptador de autenticação, recebimento, ações,
  persistência ou interface neste repositório. Não há credenciais de sandbox
  incluídas nesta etapa.
- O CI existente preserva Validation Gate, Commercial E2E e Release Gate.
  Deploy de produção exige despacho manual separado. Nenhum arquivo de
  deploy, CI, Vercel, Supabase ou migrations foi alterado.

## Código entregue

`src/lib/marketplaces/order-envelope.ts` define um contrato **interno**
dos eventos já validados por um adaptador de provedor, com:
- origem `ifood` ou `99food`, tenant e IDs externos obrigatórios;
- chaves sem colisão entre fornecedores e restaurantes;
- data com timezone, status conhecido e campos obrigatórios validados;
- deduplicação **apenas em memória no mesmo lote**;
- detecção de ID de evento repetido com conteúdo divergente;
- proteção básica contra eventos antigos que reabrem pedidos terminados.

`tests/marketplace-order-envelope.test.cjs` usa mocks sem rede e
cobre isolamento, duplicações, conflitos, entradas inválidas e status.

## Limites explícitos

Esta etapa **não conecta a 99Food à produção**, não recebe webhooks reais,
não realiza chamadas à API, não cria credenciais e não grava pedidos.
O contrato de entrada deste módulo **não é** uma representação certificada
do JSON nativo da 99Food. Não chamar normalizeMarketplaceOrderEvent
diretamente com eventos brutos de qualquer plataforma.

A idempotência no lote **não é persistente**: antes de conectar esse
contrato ao banco, implementar unicidade transacional por
`(restaurant_id, channel, external_order_id)` e
`(restaurant_id, channel, external_event_id)`, com salvaguardas para
atualizações e ACK somente após persistência confirmada.

## Próximas entregas propostas

1. Obter documentação técnica de app/credenciais de teste e contrato
   de pedidos da 99Food pelo portal oficial:
   https://developer-food.99app.com/
2. Criar adaptador 99Food separado, autenticado e com validação rigorosa
   do payload oficial, inicialmente apenas no sandbox.
3. Criar um encaminhador transacional comum com Supabase local,
   testes de concorrência, isolamento de tenant, ACK e reentrega.
4. Integrar progressivamente à fila de pedidos e testar aceite,
   cancelamento e status sem afetar o fluxo iFood em produção.
5. Validar os três gates antes de solicitar qualquer merge ou deploy.

Referências:
- iFood eventos: https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/intro
- iFood boas práticas: https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices
- 99Food portal: https://developer-food.99app.com/
