# Release gate e E2E comercial

O fluxo comercial crítico é protegido pelo job `Commercial E2E` do workflow `CI`.

O teste sobe um Supabase local e descartável no runner, aplica todas as migrations do repositório, cria uma loja/usuário/produto isolados e executa o fluxo real:

1. abre a vitrine da loja E2E;
2. adiciona um produto à sacola;
3. escolhe retirada;
4. escolhe Pix;
5. cria o pedido pela API `/api/orders` real;
6. autentica o proprietário pela API de login real;
7. abre `/admin/orders`;
8. confirma que o mesmo pedido e item aparecem no painel.

A fixture nunca usa o banco de produção e não mocka `/api/orders`.

## Check obrigatório

O job `Release gate` consolida os resultados de `validate` e `Commercial E2E`. O check a ser tornado obrigatório na proteção da branch `main` é:

`CI / Release gate`

O gate falha se qualquer validação tradicional ou o E2E comercial falhar.

## Deploy de produção

A aprovação de merge e a aprovação de deploy são responsabilidades distintas. Enquanto o projeto Vercel estiver com deploy automático por Git habilitado, o GitHub Actions não consegue impedir sozinho que a Vercel comece um deployment. Para uma barreira estrita antes da promoção para produção, a configuração de deploy da Vercel deve exigir o `CI / Release gate` ou o deploy automático de produção deve ser substituído por um job executado somente depois desse gate.
