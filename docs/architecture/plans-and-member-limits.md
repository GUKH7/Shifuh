# Planos e limites de usuários

## Status atual

A funcionalidade de **quantidade de usuários por plano está desativada**.

O Shifuh opera, por enquanto, no modelo estrito **1 usuário ↔ 1 restaurante**. Portanto:

- cada restaurante possui somente um usuário;
- esse usuário é sempre o `owner`;
- não existe convite de equipe;
- não existem papéis `admin` ou `staff` na operação atual;
- nenhum plano comercial altera a quantidade de usuários neste momento.

## Infraestrutura preservada

As tabelas `subscription_plans` e `restaurant_subscriptions` foram mantidas no banco apenas como infraestrutura futura de billing.

Também permanecem funções internas relacionadas a entitlement para facilitar uma futura retomada, mas elas não estão expostas ao cliente e **não controlam a quantidade de usuários atualmente**.

O trigger `restaurant_members_enforce_plan_limit` foi removido/desativado.

A RPC pública `get_restaurant_member_entitlement(...)` também foi removida da superfície da aplicação.

## Regra que vale hoje

A quantidade máxima de usuários não vem do plano. Ela é fixa em **1 usuário por restaurante** e é garantida por constraints/índices únicos no PostgreSQL.

Isso significa que nem interface, REST API ou código server-side podem adicionar um segundo usuário à mesma loja enquanto essa decisão estiver vigente.

## Futuro

A infraestrutura de planos poderá voltar a controlar quantidade de usuários quando a funcionalidade de equipe for retomada.

Essa reativação deve acontecer de forma explícita, incluindo:

1. definição dos planos comerciais e seus limites;
2. remoção das constraints 1:1;
3. reativação do enforcement de vagas;
4. implementação de convites e gestão da equipe;
5. definição de permissões para `owner`, `admin` e `staff`;
6. revisão de downgrade, cancelamento e cobrança.

Até essa decisão, nenhum desenvolvimento deve assumir suporte multiusuário.
