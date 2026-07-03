# Gestor Delivery

Sistema SaaS multi-tenant para restaurantes venderem por vitrine pública, receberem pedidos, operarem integrações e gerenciarem a rotina do delivery.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres e Storage
- Vercel
- Integrações com iFood e WhatsApp

## Setup local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Configure `.env.local` com as variáveis do projeto:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   WHATSAPP_BOT_API_URL=
   WHATSAPP_BOT_API_TOKEN=
   PUBLIC_API_RATE_LIMIT_MAX=
   PUBLIC_API_RATE_LIMIT_WINDOW_MS=
   PUBLIC_API_RATE_LIMIT_DISABLED=
   ```

3. Rode em desenvolvimento:

   ```bash
   npm run dev
   ```

4. Valide antes de subir:

   ```bash
   npm test
   npx tsc --noEmit
   npm run build
   ```

## Estrutura principal

```text
src/
  app/
    [slug]/                         Vitrine pública
    admin/(painel)/orders/          Pedidos e módulos auxiliares
    admin/(painel)/settings/        Configurações e módulos auxiliares
    api/                            APIs internas e públicas
  components/                       Componentes compartilhados
  features/storefront/              Hooks e UI da vitrine
  lib/
    ifood/                          Cliente, sync e mapeamentos iFood
    supabase/                       Clients e tipos Supabase
    whatsapp-bot.ts                 Cliente seguro da API WhatsApp
supabase/
  migrations/                       Migrations SQL do projeto
tests/                              Testes de API, integrações e WhatsApp
```

## Banco de dados

As migrations ficam em `supabase/migrations`. A migration `015_public_restaurants_view.sql` cria a view pública segura `public_restaurants`, usada pela vitrine para evitar exposição direta da tabela `restaurants`.

## Integrações

- iFood: credenciais centralizadas, merchant, catálogo, eventos e pedidos.
- WhatsApp: API externa protegida por variável privada e token Bearer.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes automatizados |
| `npx tsc --noEmit` | Checagem de tipos |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
