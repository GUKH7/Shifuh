# OTP de telefone via WhatsApp

O Shifuh usa o Supabase Auth como autoridade para gerar e validar o OTP. O WhatsApp e apenas o canal de entrega do codigo.

## Fluxo

```text
/auth/phone
  -> supabase.auth.signInWithOtp({ phone })
  -> Supabase Auth gera o OTP
  -> Send SMS Hook
  -> Edge Function send-phone-otp-whatsapp
  -> API WhatsApp Oracle /send-message
  -> cliente recebe o codigo no WhatsApp
  -> supabase.auth.verifyOtp({ type: "sms" })
  -> /api/customer/phone/link
  -> customer_phone_accounts + perfil + beneficios
```

O `type: "sms"` continua intencionalmente no `verifyOtp`: o Send SMS Hook substitui somente a entrega do codigo. A verificacao e a sessao continuam pertencendo ao Supabase Auth.

## Edge Function

A funcao `supabase/functions/send-phone-otp-whatsapp/index.ts` deve ser implantada com verificacao JWT desabilitada, pois a chamada vem do Auth Hook e e autenticada pela assinatura Standard Webhooks do Supabase.

Configure como secrets da Edge Function, nunca no browser e nunca no Git:

- `SEND_SMS_HOOK_SECRET`: segredo do Send SMS Hook; suporta rotacao com valores separados por `|`;
- `WHATSAPP_BOT_API_URL`: URL HTTPS publica do reverse proxy da API WhatsApp na Oracle;
- `WHATSAPP_BOT_API_TOKEN`: mesmo token esperado pela API Oracle;
- `WHATSAPP_BOT_SEND_MESSAGE_PATH`: opcional; default `/send-message`;
- `WHATSAPP_BOT_TIMEOUT_MS`: opcional; default 10000 ms.

A funcao falha fechada quando falta configuracao, a assinatura e invalida, o telefone nao e brasileiro em E.164, o OTP nao possui 6 digitos, a URL do WhatsApp nao usa HTTPS ou o upstream recusa a entrega.

## Configuracao do Supabase Auth

No projeto hospedado:

1. habilite Phone Auth;
2. mantenha confirmacao automatica de telefone desabilitada;
3. adicione um Auth Hook do tipo **Send SMS** apontando para a Edge Function `send-phone-otp-whatsapp`;
4. use o mesmo segredo do hook em `SEND_SMS_HOOK_SECRET` na Edge Function;
5. nao configure OTP de teste em producao.

Depois de ativado, `signInWithOtp` gera o codigo no Supabase e o hook o entrega pelo WhatsApp. Um HTTP 200 vazio informa ao Auth que a entrega foi aceita.

## Seguranca

- o frontend nunca recebe segredo do hook nem token da API WhatsApp;
- o hook verifica a assinatura Standard Webhooks antes de ler telefone/OTP;
- telefone e OTP nao sao gravados nos logs do hook;
- o endpoint Oracle continua protegido por Bearer token e rate limit;
- o Supabase continua aplicando expiracao e limites de requisicao do OTP;
- `/api/customer/phone/link` continua exigindo uma sessao de verificacao com `phone_confirmed_at` antes de vincular o numero;
- nenhuma alteracao cria codigo mestre, bypass ou premio/giro falso.

## Operacao

Enquanto o transporte atual usar Baileys, monitore o status da sessao WhatsApp na Oracle. Se o WhatsApp estiver desconectado, o hook devolve erro e o Supabase nao deve tratar o envio como bem-sucedido.

Em uma futura migracao para WhatsApp Business Cloud API ou outro provedor, mantenha a Edge Function como fronteira de integracao e troque apenas o transporte downstream.
