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
