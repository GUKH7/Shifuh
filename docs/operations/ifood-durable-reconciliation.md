# Etapa 4.2 — Reconciliação durável de eventos iFood

## Objetivo
Eventos que o iFood não reenviar podem ser recuperados de `raw_payload` armazenado,
com nova consulta de detalhes, sem depender de polling repetido.

## Controle transacional
- Claim atômico por restaurante e merchant, com `FOR UPDATE SKIP LOCKED`.
- RPC `security invoker` executável somente pela `service_role`.
- Lease de 150 segundos; conclusão exige token ainda vigente.
- Lease expirado permite retomada após crash; máximo de 10 eventos por chamada.
- Falha externa não consome retry; após 6 falhas permanentes, dead letter e Sentry.
- ACKs pendentes são recuperados em lotes antes do polling.
- Saúde da fila inclui contagens pendentes, ACK e dead letter.

## Ativação segura
1. Exigir PR e CI com migration resetada no Supabase local, teste SQL de concorrência e E2E.
2. Aplicar migração aditiva **apenas no projeto Supabase correto**, verificar índices, grant e RPC.
3. Publicar código com `IFOOD_PERSISTED_REPLAY_ENABLED` ausente ou `false`.
4. Homologar em ambiente isolado e só depois ativar a feature flag por deploy revisado.
5. Monitorar `ifood_reconciliation_backlog` e configurar alerta no Sentry.
6. Desativar a variável se aparecer regressão, sem necessidade de reverter colunas aditivas.

## Limitação importante
A reserva protege dois replayers concorrentes. O polling legado ainda processa eventos
por um caminho anterior, e pode ocorrer uma corrida entre polling e replay.
O índice único por restaurante/pedido e trigger de estado reduzem consequências,
mas NÃO existe garantia exatamente uma vez. Antes de habilitar a feature para todas
as lojas, integrar também o polling ao protocolo de leases e fazer E2E de concorrência.
Não enviar ACKs de produção como parte de testes.
