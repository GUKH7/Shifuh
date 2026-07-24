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

1. Instale as dependências bloqueadas pelo lockfile:

   ```bash
   npm ci
   ```

2. Configure `.env.local` com as variáveis do projeto:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ORDER_TRACKING_SECRET=
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
   npm run validate
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
    api/                            Validação e respostas padronizadas de APIs
    ifood/                          Cliente, sync e mapeamentos iFood
    supabase/                       Clients e tipos Supabase
    whatsapp-bot.ts                 Cliente seguro da API WhatsApp
supabase/
  migrations/                       Migrations SQL do projeto
tests/                              Testes de API, integrações e WhatsApp
```

## Banco de dados

As migrations ficam em `supabase/migrations`. A migration `015_public_restaurants_view.sql` cria a view pública segura `public_restaurants`, usada pela vitrine para evitar exposição direta da tabela `restaurants`.

A tabela `storefront_checkout_events` registra somente eventos anônimos do funil de checkout, sem telefone, endereço ou conteúdo da sacola. Ela permite medir abertura, etapas visitadas, abandono, erros e conclusão por restaurante.

## Integrações

- iFood: credenciais centralizadas, merchant, catálogo, eventos e pedidos.
- WhatsApp: API externa protegida por variável privada e token Bearer.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes automatizados |
| `npm run test:e2e` | Build isolado e cenários Playwright em celular e desktop |
| `npm run test:load -- <url> 100 10` | Carga HTTP GET com 100 requisições e concorrência 10 |
| `npm run audit:service-role` | Inventário e verificação dos usos do cliente administrativo |
| `npm run typecheck` | Checagem de tipos |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run validate` | Auditoria, testes, lint, TypeScript e build |

## Saúde operacional

- `GET /api/health/live`: confirma que a aplicação está executando.
- `GET /api/health/ready`: verifica a disponibilidade do banco.
- `GET /api/health/integrations`: informa a saúde das integrações secundárias.
- `GET /api/health`: mantém a verificação essencial de disponibilidade.

As respostas públicas não incluem URLs, tokens ou mensagens internas. Os detalhes técnicos são enviados como logs estruturados para os Runtime Logs da Vercel.

Os scripts de recuperação automática e backup da sessão WhatsApp ficam em `ops/oracle` e são instalados na VM como tarefas agendadas.
