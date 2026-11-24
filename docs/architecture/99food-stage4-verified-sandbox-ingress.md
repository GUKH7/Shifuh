# 99Food — etapa 4: entrada verificada, somente simulação

## Situação em 24/11/2026

A 99Food informa suporte a Open Delivery, sandbox, webhook e polling, mas os detalhes oficiais de assinatura, autenticação, payloads, ACK, retries e credenciais não estão publicamente verificáveis sem acesso de integrador.

Fontes:
- https://developer-food.99app.com/pt-BR/home
- https://aderentes.opendelivery.com.br/companies/68f696345e89f79a1563008a

**Não assumir** que 99Food usa os mesmos endpoints, HMAC, eventos ou regras de confirmação de iFood ou 99Entrega.

## Entrega desta etapa

`src/lib/99food/verified-sandbox-ingress.ts` contém uma porta interna, **não um webhook**.

A função `ingestVerified99FoodSandboxEvent`:
1. exige verifier explícito injetado por ambiente controlado;
2. limita o payload a 64 KiB;
3. autentica o conteúdo bruto **antes** de processar JSON;
4. exige identidade de merchant compatível com o contexto de servidor;
5. rejeita qualquer formato diferente das fixtures sintéticas `shifuh-99food-sandbox-v1`;
6. envia o evento normalizado ao contrato de persistência transacional do staging;
7. propaga falha de autenticação/DB sem gerar um ACK para o provedor.

`tests/99food-verified-sandbox-ingress.test.cjs` cobre sucesso simulado, falhas de autenticação, ID de merchant divergente, payload desconhecido, JSON malformado, limite de tamanho, falha de banco e falta de verificadores.

## Restrições preservadas

- **Nenhum** endpoint público ou token oficial da 99Food.
- **Nenhuma** alteração no iFood, na fila operacional ou nos pedidos reais.
- **Nenhuma** migração real, execução remota, deploy/Preview ou workflow_dispatch.
- **Nenhuma** assinatura de produção implementada: o verifier deste estágio é uma dependência fornecida apenas por testes.

## Bloqueio para homologação real

Solicitar à 99Food o acesso à documentação do integrador/sandbox e confirmar formalmente:
- autenticação da aplicação, autorização das lojas e identificação do merchant;
- formato exato dos eventos, assinaturas e método de verificação da origem;
- polling/webhook e políticas de retransmissão;
- formatos de ACK, timeout, idempotência e estados de pedido;
- exemplos oficiais de mensagens e como efetuar a homologação.

Após receber esses dados, implementar o adaptador **oficial** e testes de contrato em outra branch, com mock server e Supabase local. Não ligar o webhook nem habilitar a loja real antes de autorização específica.
