# Observabilidade externa — Sentry

O Shifuh mantém os logs estruturados existentes como fonte operacional local/Vercel e usa o Sentry como uma segunda camada para erros, traces, releases e alertas.

## Arquitetura

- `logOperationalEvent()` continua escrevendo JSON em stdout com `level`, `event`, `timestamp` e contexto.
- Os mesmos eventos operacionais viram breadcrumbs sanitizados no Sentry para reconstruir o que aconteceu antes de uma falha.
- Erros não tratados no servidor são capturados pelo hook `instrumentation.ts`/`onRequestError` do Next.js.
- `console.error` no runtime Node é capturado pelo Sentry para cobrir falhas tratadas que já eram registradas pelo código existente.
- Erros React não tratados são capturados por `src/app/global-error.tsx`.
- Navegação client-side e requests do Next entram em traces com sampling configurável.
- Session Replay fica desligado por padrão.
- A ausência de DSN desliga a exportação externa sem afetar logs, health checks ou o funcionamento da aplicação.

## Privacidade

A integração usa `sendDefaultPii: false` e um `beforeSend` próprio.

O scrubber:

- remove cookies, body e query string de requests;
- remove dados de usuário, preservando apenas `user.id` quando existir;
- mascara chaves relacionadas a autorização, tokens, secrets, senhas, API keys, telefone, e-mail, endereço, CEP, CPF/CNPJ e observações;
- mascara e-mails, telefones e JWTs encontrados em strings;
- remove query string/hash de URLs;
- preserva stack frames e spans para não degradar a utilidade dos traces.

Não adicionar PII manualmente em tags, breadcrumbs ou contexts.

## Variáveis na Vercel

Runtime:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE` — recomendado inicialmente `0.10` em Production
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` — recomendado inicialmente `0.05` em Production

Build/source maps:

- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

O token de autenticação é segredo de build e nunca deve usar o prefixo `NEXT_PUBLIC_`.

`next.config.mjs` injeta no bundle do browser o `VERCEL_ENV` como `NEXT_PUBLIC_APP_ENVIRONMENT` e o SHA do deployment como `NEXT_PUBLIC_APP_RELEASE`. Isso impede que Preview seja classificado como Production apenas porque ambos são builds com `NODE_ENV=production`.

## Conectar Sentry e Vercel

1. Criar ou selecionar o projeto Next.js do Shifuh no Sentry.
2. Instalar/conectar a integração oficial Sentry no projeto da Vercel.
3. Configurar os DSNs e credenciais de source maps nos ambientes desejados.
4. Fazer um novo deployment para que source maps/release sejam publicados.
5. Confirmar no Sentry que um evento de teste controlado aparece no ambiente correto antes de habilitar alertas de paging.

O código não contém endpoint público que gere erro artificial. Testes de captura devem ser feitos de forma controlada pelo painel/ferramentas do Sentry ou em Preview autenticado.

## Alertas recomendados

Começar com poucos alertas acionáveis para evitar fadiga:

### 1. Novo erro em Production

Criar um Issue Alert para primeiro evento de um novo issue no ambiente `production`.

Destino inicial: e-mail do responsável técnico. Quando existir canal operacional dedicado, adicionar Slack/PagerDuty conforme necessidade.

### 2. Pico de erros

Criar Metric Alert para taxa/contagem de erros em Production:

- janela: 5 minutos;
- alerta inicial: 5 ou mais eventos de erro na janela;
- warning opcional: 3 eventos na janela;
- aplicar cooldown para não repetir a mesma notificação continuamente.

Ajustar os limites após 1–2 semanas de tráfego real.

### 3. Checkout

Filtrar transações/erros da rota `/api/orders` e alertar quando houver repetição de falhas 5xx ou issues associados à criação de pedidos.

Falhas 4xx de validação de usuário não devem virar paging operacional.

### 4. Performance

Depois de acumular baseline real, criar alerta de p95 para transações server-side críticas, começando por:

- `/api/orders`;
- vitrine inicial;
- contexto administrativo.

Não definir SLO/p95 arbitrário antes de observar pelo menos alguns dias de produção. O primeiro objetivo é detectar regressões significativas sobre o baseline.

## Sampling

Defaults do código quando nenhuma variável é fornecida:

- server/edge em builds com `NODE_ENV=production`: 10%;
- browser em builds com `NODE_ENV=production`: 5%;
- desenvolvimento local: 100% enquanto houver DSN.

Os valores são limitados entre `0` e `1`.

Para custos, aumentar sampling somente em janelas de investigação ou rotas críticas.

## Source maps e releases

`next.config.mjs` só ativa `withSentryConfig` quando `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` estão presentes ao mesmo tempo.

Isso garante que:

- CI sem credenciais continua construindo normalmente;
- Preview sem Sentry continua funcionando;
- builds configurados publicam source maps para stack traces legíveis.

## Checklist de ativação

- [ ] Projeto Sentry criado/conectado.
- [ ] Integração Sentry instalada na Vercel.
- [ ] DSN server + client configurados em Production.
- [ ] Sampling configurado.
- [ ] Credenciais de source maps configuradas.
- [ ] Deployment de Production concluído.
- [ ] Evento controlado recebido no Sentry.
- [ ] Trace de request recebido.
- [ ] Stack trace resolve para TypeScript/source map.
- [ ] Alertas de novo issue e pico de erros habilitados.
- [ ] Nenhum dado pessoal sensível aparece no evento de teste.

## Operação durante incidente

1. Consultar o issue no Sentry e confirmar ambiente/release.
2. Usar trace e breadcrumbs para identificar rota e sequência operacional.
3. Correlacionar horário/request com logs estruturados da Vercel.
4. Verificar `/api/health` e dependências externas.
5. Registrar correção e acompanhar regressão após o deployment.

A camada externa complementa os logs; ela não deve ser usada como substituta do logging estruturado existente.
