# Recuperação de indisponibilidade iFood (Etapa 4)

## Sintoma de produção

Em 21/10/2026, o cron de pedidos registrou HTTP 504 oriundo do
Cloudflare/iFood com `retryable=true` e `retry_after=120`.
Isso é uma janela de indisponibilidade externa, não prova pedido perdido.

## Comportamento esperado

- HTTP 408/425/429/5xx sem cooldown explícito: retentativas breves e limitadas.
- `Retry-After` (segundos ou data HTTP) e `retry_after` (JSON em segundos):
  usar a maior dica válida. Se superior a 2,5s, desistir de novas chamadas
  naquela execução, preservando o erro e informando o cooldown ao cron.
- O worker respeita o header `Retry-After` do cron no próximo agendamento,
  com teto de 15 minutos; não ocupa uma função serverless por 120 segundos.
- Erros globais de polling/ACK **não aumentam** `retry_count` dos eventos
  previamente armazenados. Somente IDs de eventos que efetivamente falharam
  durante o processamento podem ter seu contador atualizado.
- Se o banco não confirmar `processed_at`, o evento **não deve receber ACK**.
- `/api/cron/ifood/resilient-orders` continua isolando restaurantes, com
  concorrência de 2, resultados parciais e header de espera quando apropriado.

## Verificação pós-publicação

1. CI + Commercial E2E + Release gate verdes.
2. Em laboratório: simular HTTP 504 com `retry_after=120`;
   confirmar 1 tentativa upstream e retry do worker somente após o prazo.
3. Simular gravação de pedido bem-sucedida e falha ao marcar `processed_at`:
   **nenhum ACK**, evento pendente, sem duplicação do pedido no retry.
4. Em ambiente isolado, forçar indisponibilidade de polling com eventos
   pendentes; verificar que os retries/dead letter não aumentam.
5. Após retorno da API, fazer reconciliação de pedidos e verificar os IDs
   de pedidos/eventos afetados. Não usar mensagens reais para esse teste.

## Limites e trabalho seguinte

A fila persistente ainda depende do retorno dos eventos pelo polling; há uma
oportunidade separada de implementar replay com lease distribuído dos
`raw_payload` persistidos, reconciliação de ACKs e alertas de dead letter.
Isso demanda teste integrado de concorrência e não deve ser improvisado em
produção. Nunca executar polling de alta frequência com credenciais de lojas
reais apenas para testar o retry.
