# OTP de telefone via WhatsApp por restaurante

O Shifuh usa o Supabase Auth como autoridade para gerar e validar o OTP. O WhatsApp e apenas o canal de entrega do codigo, e a mensagem deve sair **do WhatsApp conectado do restaurante cuja vitrine originou a verificacao**.

Nao existe fallback silencioso do OTP para um numero central do Shifuh. Se a loja nao possui uma sessao WhatsApp conectada, a solicitacao deve falhar de forma explicita.

## Fluxo

```text
/{slug-da-loja}
  -> /auth/phone?returnUrl=/{slug-da-loja}
  -> POST /api/customer/phone/otp-route
       valida sessao do cliente
       resolve o restaurante pelo slug no servidor
       grava contexto efemero telefone -> restaurant_id (5 min)
  -> supabase.auth.signInWithOtp({ phone })
  -> Supabase Auth gera o OTP
  -> Send SMS Hook
  -> Edge Function send-phone-otp-whatsapp
       valida assinatura Standard Webhooks
       recupera restaurant_id pelo contexto efemero
  -> API Oracle /restaurants/{restaurant_id}/send-message
  -> sessao Baileys exclusiva daquele restaurante
  -> cliente recebe o codigo do WhatsApp da loja
  -> supabase.auth.verifyOtp({ type: "sms" })
  -> /api/customer/phone/link
  -> customer_phone_accounts + perfil + beneficios
```

O `type: "sms"` continua intencionalmente no `verifyOtp`: o Send SMS Hook substitui somente a entrega do codigo. A verificacao, expiracao e sessao continuam pertencendo ao Supabase Auth.

## Contexto efemero de roteamento

A tabela server-only `customer_phone_otp_routes` existe apenas para transportar o contexto de tenant que nao faz parte do payload nativo do Send SMS Hook. Ela armazena:

- usuario autenticado que solicitou o codigo;
- telefone brasileiro normalizado;
- `restaurant_id` resolvido no servidor a partir do `returnUrl` seguro da vitrine;
- expiracao curta de 5 minutos;
- instante de consumo apos entrega aceita.

`anon` e `authenticated` nao possuem acesso direto a essa tabela. O frontend nunca escolhe um `restaurant_id`: ele envia telefone + `returnUrl`, e a API do Shifuh resolve o slug contra `restaurants` usando a sessao autenticada e service role somente no servidor.

## Edge Function

A funcao `supabase/functions/send-phone-otp-whatsapp/index.ts` deve ser implantada com verificacao JWT desabilitada, pois a chamada vem do Auth Hook e e autenticada pela assinatura Standard Webhooks do Supabase.

Configure como secrets da Edge Function, nunca no browser e nunca no Git:

- `SEND_SMS_HOOK_SECRET`: segredo do Send SMS Hook; suporta rotacao com valores separados por `|`;
- `WHATSAPP_BOT_API_URL`: URL HTTPS publica do reverse proxy da API WhatsApp na Oracle;
- `WHATSAPP_BOT_API_TOKEN`: mesmo token esperado pela API Oracle;
- `WHATSAPP_BOT_HOOK_DELIVERY_TIMEOUT_MS`: opcional; limitado a no maximo 4000 ms para respeitar a janela do Auth Hook.

A Edge Function tambem usa os secrets padrao `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` disponibilizados no ambiente de Functions para consultar e consumir o contexto de roteamento.

A funcao falha fechada quando falta configuracao, a assinatura e invalida, o telefone nao e brasileiro, o OTP nao possui 6 digitos, a URL do WhatsApp nao usa HTTPS, nao existe contexto de loja valido ou o WhatsApp daquele restaurante nao aceita a entrega.

## Sessoes WhatsApp na Oracle

A API Baileys mantem isolamento por restaurante:

```text
./baileys_restaurant_sessions/{restaurant_id}/
```

Cada tenant possui estado independente:

- credenciais Baileys;
- socket;
- status de conexao;
- QR Code;
- contador e timer de reconexao.

Rotas tenant-aware:

```text
GET  /restaurants/{restaurant_id}/status
POST /restaurants/{restaurant_id}/restart
POST /restaurants/{restaurant_id}/send-message
```

O `restaurant_id` precisa ser UUID valido. As rotas continuam protegidas pelo Bearer token da plataforma e rate limit. Um restart em uma loja nao apaga nem reinicia a sessao das demais.

As rotas legacy `/status`, `/restart` e `/send-message` ficam temporariamente disponiveis durante a migracao de outros fluxos, mas **o OTP nao usa nenhuma delas**.

## Configuracao inicial de cada restaurante

Quando o administrador abre a secao de WhatsApp nas configuracoes, `/api/whatsapp-bot/status` resolve a loja autenticada e consulta a sessao correspondente na Oracle. Para uma loja ainda nao conectada, a Oracle inicializa a sessao e gera um QR Code exclusivo.

O restaurante deve escanear esse QR com o WhatsApp que deseja usar para comunicacao com seus clientes. Depois de conectado, status, restart e OTP daquela loja usam apenas essa sessao.

## Configuracao do Supabase Auth

No projeto hospedado:

1. habilite Phone Auth;
2. mantenha confirmacao automatica de telefone desabilitada;
3. adicione um Auth Hook do tipo **Send SMS** apontando para a Edge Function `send-phone-otp-whatsapp`;
4. use o mesmo segredo do hook em `SEND_SMS_HOOK_SECRET` na Edge Function;
5. nao configure OTP de teste em producao.

Depois de ativado, `signInWithOtp` gera o codigo no Supabase e o hook o entrega pelo WhatsApp do restaurante selecionado pelo contexto seguro da vitrine.

## Seguranca

- o frontend nunca recebe segredo do hook nem token da API WhatsApp;
- o frontend nao escolhe diretamente o `restaurant_id` usado no transporte;
- o hook verifica a assinatura Standard Webhooks antes de ler telefone/OTP;
- telefone e OTP nao sao gravados nos logs do hook;
- o endpoint Oracle continua protegido por Bearer token e rate limit;
- o diretorio de autenticacao de uma loja nao e compartilhado com outra;
- o Supabase continua aplicando expiracao e limites de requisicao do OTP;
- `/api/customer/phone/link` continua exigindo uma sessao de verificacao com `phone_confirmed_at` antes de vincular o numero;
- nenhuma alteracao cria codigo mestre, bypass ou premio/giro falso.

## Operacao

Se o WhatsApp de uma loja estiver desconectado, o OTP daquela loja deve falhar; nenhuma outra sessao pode substitui-lo. O administrador reconecta somente aquela loja pelo QR Code em Configuracoes.

Em uma futura migracao para WhatsApp Business Cloud API ou outro provedor, mantenha a Edge Function como fronteira de integracao e preserve o `restaurant_id` como chave obrigatoria de roteamento do transporte.
