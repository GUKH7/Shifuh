# Homologação isolada do replay iFood

O replay permanece **desligado** em ambientes persistentes, incluindo produção. O CI executa `IFOOD_PERSISTED_REPLAY_ENABLED=true` somente no job Commercial E2E com banco Supabase local descartável.

## Isolamento
- Abortado se a URL do Supabase não apontar para localhost/127.0.0.1.
- Não utiliza endpoints HTTP externos do iFood: os detalhes e os ACKs são simulados.
- Usa o Postgres local real, a migration de leases e a rotina real de replay e de gravação de pedidos.
- Usa apenas a loja sintética E2E e IDs de eventos aleatórios; não acessa dados reais.

## Critérios de aprovação
- 4 eventos persistidos iniciais, 2 processados para **1 único pedido local**, 1 com erro temporário HTTP 504 e cooldown 120 s, 1 em dead-letter após falhas permanentes.
- ACK pendente para os 2 processados; somente os processados podem ser confirmados na simulação.
- Retry_count preservado durante 504; evento temporário agendado para depois.
- Uma segunda passagem imediata não reprocessa eventos concluídos, em cooldown ou dead-letter.
- Fila final: pending=1, awaitingAcknowledgement=0, deadLettered=1; pedidos duplicados=0.

## Limites
Um teste com fornecedor simulado não confirma entrega real de ACK ao iFood nem garante consistência durante uma falha prolongada de múltiplos workers em produção. Antes da ativação persistente, criar banco de homologação independente (a branch Supabase exige aprovação dos custos), configurar credenciais iFood não produtivas, verificar migration instalada e preparar rollback. Nunca ligar a flag na Preview que compartilhe credenciais com produção.


## Matriz gratuita de falhas prolongadas (CI, banco descartável)

O E2E executa `scripts/ifood-replay-homologation.cjs` contra PostgreSQL local, sem iFood ou WhatsApp reais. Foram adicionados cenários com as seguintes condições de aprovação:

- Dois workers disputam simultaneamente eventos pelo RPC; a soma dos eventos reservados não excede o total de eventos disponíveis.
- Oito respostas HTTP 504, com `Retry-After: 120s`, simulam **16 minutos de indisponibilidade por avanço artificial** de `next_retry_at`. Não há espera de 16 minutos nem alteração do relógio real.
- A indisponibilidade não aumenta `retry_count`, não cria pedidos e não envia eventos à dead-letter.
- Assim que o mock iFood volta a funcionar, o evento previamente persistido é recuperado **sem depender de novo polling**, criando um único pedido de teste; replay imediato não o duplica.
- Um backlog de **107 ACKs** já processados é preservado após duas falhas de transporte 504; na recuperação, são enviados nos lotes [100, 7] e marcados no banco apenas depois da confirmação simulada.
- Duas chamadas simultâneas do serviço resiliente compartilham o processamento da instância; uma chamada subsequente não reenvia ACKs já persistidos.
- A matriz de leases no PostgreSQL cobre mais de dez eventos com workers concorrentes, limite de lote 10, tokens exclusivos, isolamento de tenant, expiração, fencing e suspensão/reativação de integração.

**Limite:** o teste é determinístico e acelera o tempo de retentativas atualizando apenas dados fictícios em banco local. Não substitui um teste de indisponibilidade real do fornecedor nem comprova ACKs reais em produção. A flag segue desligada na Vercel e nenhum recurso pago é criado.


## Worker restart / crash boundaries (local Postgres, no remote calls)

A separate CI step runs \`scripts/ifood-worker-restart-homologation.cjs\`. The test starts **distinct Node processes**, not merely async workers in one process:

1. Process A commits a synthetic order via the **real** create-order RPC and then exits with code 71 before persisting \`processed_at\` and before any ACK. The local lease is expired in the test only.
2. Process B starts fresh, reads the same event and existing order, persists \`processed_at\`, then exits with code 72 before ACK.
3. Process C starts fresh, recovers the ACK even when iFood polling returns no events. A further fresh worker confirms no duplicate ACK or order.
4. Two other Node processes reserve **distinct event IDs for the same order ID** (one each) and wait at a deterministic barrier before both upsert the order. The unique external-order constraint must prevent duplicate local orders; any losing event may retry later, after its synthetic cooldown. Both event IDs must ultimately refer to the same order and be ACKed.
5. All rows are artificial, integration is fixture-only, provider is mocked, and both events and orders are cleaned after the test.

**Important:** This test proves crash/restart and eventual processing/ACK behavior on a disposable database. It does not guarantee that distinct event statuses arrive in chronological order or that ambiguous network ACKs are externally idempotent. No feature flag is changed on production and this PR must not be merged as part of validation.


## Ambiguous ACKs and out-of-order events

The optional disposable Postgres CI step \`scripts/ifood-ack-status-homologation.cjs\` uses iFood mocks and synthetic orders only:

1. Mock provider **accepts** ACK but a synthetic database write fails before commit: ACK remains pending, no order is replayed, and a later run retransmits the **same** ID. This is *at-least-once* transport, not exactly-once delivery.
2. The database **commits** ACK but the application loses its response: a fresh query sees \`acknowledged_at\`; no duplicate provider call is needed.
3. The provider accepts ACK then network returns synthetic HTTP 504: local ACK stays pending until a successful retry of the same ID. The mock is idempotent; this does **not** establish real iFood behavior.
4. Out-of-order status events (CFM then stale PLC, DSP then stale CFM, terminal DONE then CAN) and canceled order followed by old PLC and conflicting DONE: PostgreSQL trigger preserves status; both status and cancellation reason must remain consistent.
5. All rows and mocks are cleaned, with no network access to production Supabase/iFood. CI never merges or deploys on a PR.

The test specifically rejects the unsafe assumption that a successful provider response guarantees durable local confirmation. Repeating the ACK may be necessary; operation must remain idempotent upstream. Never mark an ACK as committed locally if the provider has not confirmed it.
