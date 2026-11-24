# 99Food — etapa 5: matriz do contrato oficial e ensaio fechado (24/11/2026)

## Evidências e limites

- Cadastro da 99Food na Open Delivery: https://aderentes.opendelivery.com.br/companies/68f696345e89f79a1563008a
  - Declara conformidade de **Pedidos** e **Merchant** como "Pronto para Integrar".
  - Declara **sandbox próprio** e recebimento de eventos por **Webhook e Polling**.
  - Informa o suporte de integração **99FoodTechSupport@didiglobal.com**.
- Portal oficial da 99Food: https://developer-food.99app.com/pt-BR/home
  - A página de acesso público requer JavaScript; documentação detalhada não pôde ser verificada de modo independente nesta etapa.
- Não reutilizar por suposição endpoints, formato de assinatura ou ACK de **99Entrega** ou **iFood**.
- Materiais de integradores terceiros podem indicar fluxos gerais, mas **não** substituem contrato emitido pela 99Food.

## Matriz de prontidão do contrato

| Requisito | Evidência verificável | Situação |
| --- | --- | --- |
| Sandbox próprio | Perfil público da 99Food na Open Delivery | Confirmado como recurso disponível; acesso do Shifuh não comprovado |
| Webhook e polling | Perfil público da 99Food na Open Delivery | Canais anunciados; sem endpoints verificados |
| Pedidos e merchant | Perfil público da 99Food na Open Delivery | Compatibilidade declarada; campos concretos não verificados |
| Aplicação e credenciais | Requer portal de integrador/contato | Pendente |
| Autorização da loja/merchant | Requer documentação oficial e sandbox | Pendente |
| Autenticação de chamadas e eventos | Requer contrato de assinatura/autenticação oficial | Pendente |
| Schema, eventos, estados e versionamento | Requer payloads oficiais redigidos sem dados reais | Pendente |
| Tratamento de redelivery, replay, retries | Requer especificação oficial | Pendente |
| ACK/confirm e timeouts | Requer especificação oficial | Pendente |
| Operações que atualizam status | Requer especificação oficial | Pendente |
| Regras de certificação e produção | Requer documentação e autorização oficial | Pendente |

## Entrega técnica desta branch

- `src/lib/99food/contract-probe.ts`: **somente teste** para receber bytes, executar um verificador simulado **antes** da decodificação, conferir merchant/tenant/canal e passar o envelope normalizado para a interface de persistência atômica já existente.
- `tests/99food-contract-probe.test.cjs`: verifica ordem autenticar → decodificar → persistir; barramento fail-closed; corpo grande, cabeçalho inválido, erro de banco, escopo incorreto, evento repetido e regressão de status terminal.
- Esta etapa **não** contém implementação de autenticação oficial, webhook real, integração de polling, ACK de provedor nem acesso à API externa.
- A simulação de replay no teste usa store em memória; a concorrência real no PostgreSQL local já é coberta pela suíte de homologação transacional existente.

## Solicitação necessária ao suporte oficial

Enviar pedido de cadastro **como integrador de software/PDV Shifuh**, solicitando:
1. Acesso ao portal de desenvolvedores e à homologação sandbox;
2. Documentação atual e versionada da API de Pedidos e Merchant;
3. Exemplos **sintéticos** completos de evento e pedido, com todas as variantes de status;
4. Regras de webhook, polling, autenticação/assinatura, deduplicação, retries, confirmação e limites;
5. Procedimento de autorização das lojas, credenciais de teste, certificação e requisitos de segurança.

Não inserir tokens, segredos, pedidos pessoais ou dados de restaurantes reais em issues, PRs ou commits. Somente usar exemplos artificiais ou sanitizados. Nenhuma mensagem externa foi enviada nesta etapa.

## Critérios para a próxima fase

Só implementar o adaptador **oficial** quando houver documentos primários verificados, fluxo de credenciais de sandbox autorizado e exemplos testáveis; colocar o adaptador em branch própria, fazer testes de contrato e validar idempotência no Supabase local antes de considerar qualquer tráfego de rede.

## Salvaguardas

Não modificar o iFood; não criar endpoints acessíveis publicamente; não habilitar leitura/escrita operacional; não realizar merge, Vercel Preview/deploy, `workflow_dispatch`, migrações remotas ou compra de recursos pagos sem autorização específica.
