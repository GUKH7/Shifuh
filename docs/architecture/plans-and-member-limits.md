# Planos e limites de usuários

## Regra de negócio

No Shifuh, a quantidade de usuários é uma característica da assinatura da **loja**.

- O proprietário (`owner`) conta como um usuário.
- Administradores (`admin`) e operadores (`staff`) também consomem uma vaga cada.
- `subscription_plans.member_limit` define o total máximo de membros da loja.
- `member_limit = NULL` representa um plano sem limite de usuários.
- Loja sem assinatura ativa possui somente **1 vaga**, reservada na prática ao proprietário.

Os limites comerciais não ficam hardcoded no frontend. Eles são dados do catálogo `subscription_plans`, permitindo alterar limites sem nova versão da aplicação.

## Estrutura

### `subscription_plans`

Catálogo dos planos comerciais. Os principais campos são:

- `code`: identificador estável para integrações e billing.
- `name`: nome apresentado ao usuário.
- `member_limit`: quantidade máxima de membros; `NULL` significa ilimitado.
- `is_active`: indica se o plano pode ser comercializado atualmente.

### `restaurant_subscriptions`

Representa a assinatura vigente da loja e já possui campos para futura integração com um gateway de cobrança:

- `restaurant_id`
- `plan_id`
- `status`
- `provider`
- `provider_customer_id`
- `provider_subscription_id`
- `started_at`
- `current_period_end`
- `cancel_at_period_end`

Os estados que concedem a capacidade do plano são `trialing`, `active` e `past_due`. Outros estados fazem a loja cair para o limite padrão de 1 usuário.

## Enforcement

O limite é imposto no PostgreSQL, e não apenas na interface.

O trigger `restaurant_members_enforce_plan_limit` executa antes de qualquer novo vínculo em `restaurant_members`. Ele:

1. serializa inclusões simultâneas na mesma loja com advisory lock;
2. obtém a assinatura vigente e o `member_limit` do plano;
3. conta todos os membros atuais, incluindo o proprietário;
4. bloqueia a inclusão quando não existe mais vaga.

O erro canônico é `restaurant_member_limit_reached`.

Isso impede contorno por cliente REST, chamadas concorrentes, service code mal implementado ou clique duplo.

## Downgrade e cancelamento

Uma mudança de assinatura **não remove membros automaticamente**.

Caso uma loja passe a ter mais membros do que o novo plano permite, a assinatura continua registrada e a loja fica em estado de excesso de vagas (`is_over_limit = true`). Novos membros permanecem bloqueados até que a equipe seja reduzida ou o plano seja ampliado.

Essa decisão evita desligar funcionários silenciosamente em decorrência de webhook, falha de pagamento ou downgrade.

## Leitura de capacidade

A RPC autenticada `get_restaurant_member_entitlement(restaurant_id)` retorna:

- plano e status da assinatura;
- `member_limit`;
- `members_used`;
- `members_remaining`;
- `is_unlimited`;
- `is_over_limit`.

Ela só retorna dados para membros da própria loja (ou código confiável usando `service_role`).

## Compatibilidade inicial

As lojas existentes antes desta implementação receberam o plano interno `legacy`, com usuários ilimitados, para que a migração não remova ou bloqueie acessos existentes.

O plano `legacy` não é comercial (`is_active = false`). As lojas devem ser migradas para os planos comerciais assim que o catálogo definitivo de assinatura for definido.

Novas lojas sem assinatura comercial começam com limite efetivo de 1 usuário.

## Integração futura com cobrança

O gateway de pagamento deverá atualizar `restaurant_subscriptions` exclusivamente pelo backend confiável. O frontend não recebe permissão para alterar plano ou status diretamente.

A interface de equipe deve consultar `get_restaurant_member_entitlement` antes de apresentar a ação de convite e transformar `restaurant_member_limit_reached` em uma mensagem de upgrade de plano.
