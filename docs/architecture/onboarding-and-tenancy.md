# Onboarding e arquitetura multi-loja

## Decisão arquitetural

O Shifuh adota formalmente a relação **usuários/membros ↔ várias lojas**.

- Um usuário autenticado pode ser membro de zero, uma ou várias lojas.
- Uma loja pode ter vários membros.
- `public.restaurant_members` é a fonte canônica de autorização e vínculo entre usuário e loja.
- `public.restaurants.user_id` existe apenas como compatibilidade temporária com código legado e representa o criador/origem da loja. Ele **não deve ser usado em RLS, autorização ou resolução da loja atual**.

## Papéis

Cada vínculo em `restaurant_members` possui um papel:

- `owner`: proprietário do estabelecimento.
- `admin`: administrador da operação.
- `staff`: membro operacional.

Nesta etapa, todos os papéis de membro preservam o mesmo acesso operacional que o antigo proprietário tinha. A tabela já permite evoluir para uma matriz de permissões sem alterar a relação de tenancy.

## Loja atual

Um usuário pode ter no máximo uma associação marcada como `is_default = true`.

A seleção da loja atual segue esta ordem:

1. associação marcada como padrão;
2. associação mais antiga, de forma determinística.

A RPC `set_default_restaurant(uuid)` é o mecanismo formal para trocar a loja padrão quando a interface de múltiplas lojas for exposta.

## Regra de onboarding

Criar uma conta de autenticação **não cria uma loja**.

O trigger `app_private.handle_new_user()` cria/atualiza somente o perfil em `public.profiles`.

A primeira loja é criada exclusivamente pela RPC autenticada `create_onboarding_restaurant(name, slug)`. A implementação privilegiada fica em `app_private`; a função exposta em `public` é apenas um wrapper `SECURITY INVOKER`.

O onboarding é idempotente:

- a execução é serializada por usuário;
- se o usuário já possui qualquer associação a loja, a RPC devolve a loja existente e não cria outra;
- a criação da loja e do vínculo `owner` ocorre na mesma transação;
- `restaurants` não possui policy de `INSERT` para usuários autenticados, impedindo que o cliente contorne o fluxo oficial com um insert direto.

Uma futura ação explícita **Adicionar loja** deve usar um fluxo separado do onboarding. Ela não deve reutilizar `create_onboarding_restaurant`, pois essa RPC é deliberadamente limitada à primeira associação do usuário.

## Cadastro com confirmação de e-mail

O formulário administrativo grava temporariamente `onboarding_restaurant_name` e `onboarding_restaurant_slug` em `auth.users.user_metadata` no `signUp`.

- Se o Supabase devolver uma sessão imediatamente, a mesma tela chama a RPC de onboarding.
- Se a confirmação de e-mail for obrigatória, nenhuma loja é criada antes da autenticação. Após o primeiro login, `/admin/setup` recupera os dados do metadata e conclui o onboarding pela mesma RPC.

Isso garante um único escritor de loja independentemente da configuração de confirmação de e-mail.

## Autorização

As policies de RLS das entidades de restaurante consultam `restaurant_members`, incluindo pedidos, produtos, categorias, cupons, CRM, avaliações, analytics, integração iFood e uploads no Storage.

Policies de consumidor final continuam independentes e baseadas no próprio `auth.uid()` quando apropriado.
