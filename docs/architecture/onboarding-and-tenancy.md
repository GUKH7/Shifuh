# Onboarding e arquitetura de tenancy

## Decisão atual

O Shifuh opera, por enquanto, no modelo estrito **1 usuário ↔ 1 restaurante**.

- Cada usuário autenticado pode administrar somente um restaurante.
- Cada restaurante possui somente um usuário, sempre com papel `owner`.
- Não há convite de equipe, papéis `admin`/`staff`, troca de loja ou múltiplas unidades na experiência atual.
- `public.restaurant_members` continua sendo a fonte canônica usada pelas policies de RLS, mas o banco impõe unicidade dos dois lados da relação.
- `public.restaurants.user_id` também possui unicidade por usuário como defesa adicional.

A estrutura de memberships foi preservada porque mantém a autorização já endurecida e permite uma evolução futura sem reescrever todas as policies. Ela não significa que multiusuário esteja habilitado.

## Restrições de banco

O PostgreSQL garante a regra 1:1, não apenas a interface:

- `restaurant_members.user_id` é único;
- `restaurant_members.restaurant_id` é único;
- `restaurants.user_id` é único quando preenchido;
- todo vínculo em `restaurant_members` deve ter `role = 'owner'`;
- todo vínculo deve permanecer `is_default = true`.

Assim, uma chamada direta à API ou código server-side incorreto também não consegue criar um segundo usuário para a loja nem um segundo restaurante para o mesmo usuário.

## Regra de onboarding

Criar uma conta de autenticação **não cria uma loja automaticamente**.

O trigger `app_private.handle_new_user()` cria/atualiza somente o perfil em `public.profiles`.

A loja é criada exclusivamente pela RPC autenticada `create_onboarding_restaurant(name, slug)`.

O onboarding é idempotente:

- a execução é serializada por usuário;
- se o usuário já possui restaurante, a RPC devolve a loja existente e não cria outra;
- a criação de `restaurants` e do vínculo `restaurant_members` como `owner` ocorre na mesma transação;
- não existe policy de `INSERT` direto em `restaurants` para o cliente autenticado.

## Cadastro com confirmação de e-mail

O formulário administrativo grava temporariamente `onboarding_restaurant_name` e `onboarding_restaurant_slug` no metadata do usuário.

- Se o cadastro já devolver uma sessão autenticada, a mesma tela conclui o onboarding.
- Se a confirmação de e-mail for obrigatória, `/admin/setup` recupera esses dados após o primeiro login e conclui a criação pela mesma RPC.

## Autorização

As policies das entidades de restaurante continuam consultando `restaurant_members`, incluindo pedidos, produtos, categorias, cupons, CRM, avaliações, analytics, iFood e Storage.

Como existe no máximo um vínculo por usuário e um vínculo por restaurante, essa camada de autorização funciona atualmente como uma relação 1:1.

## Funcionalidades adiadas

Multi-loja e multiusuário ficam explicitamente **desativados** nesta fase.

Não devem ser adicionados ao produto, por enquanto:

- botão `Adicionar loja`;
- seletor/troca de restaurante;
- convite de usuários;
- papéis `admin` e `staff`;
- limites de usuários por plano.

Quando o Shifuh decidir reativar essas capacidades, será necessária uma migration explícita removendo as constraints 1:1 e uma nova revisão de autorização, billing e UX.
