# Disponibilidade do WhatsApp: API versus sessões por restaurante

## Diagnóstico da falha HTTP 410

O monitoramento de `/api/health/integrations` do Shifuh consultava
`WHATSAPP_BOT_API_URL/status`. Na API da VM Oracle, `/status` é a rota
**legada da sessão global**. Quando a migração multi-tenant desativa essa
sessão (`WHATSAPP_LEGACY_SESSION_ENABLED=false`), a API devolve HTTP 410
por projeto: `Sessao global desativada; use a rota do restaurante.`

Isso não prova que a API do bot está indisponível.

O monitoramento de disponibilidade consulta **`GET /health`**, que
retorna `{ "status": "ok", "service": "shifuh-whatsapp-api" }`. A checagem
falha em caso de HTTP diferente de 2xx, erro de rede ou payload inválido.
O Nginx permite `/health`, e o watchdog Oracle também usa essa rota.

## O que significa uma integração "healthy"?

- `/api/health/integrations` está `healthy`: o **serviço da API** foi
  encontrado e respondeu corretamente. **Não** significa que alguma loja
  conectou seu WhatsApp, nem que o envio de mensagens funciona.
- `GET /api/whatsapp-bot/status` (administrador autenticado) consulta
  `/restaurants/{uuid}/status` na Oracle e informa o estado da conexão
  **da loja autenticada**.
- OTP e mensagens por restaurante usam
  `/restaurants/{uuid}/send-message`; a confirmação de envio precisa ser
  testada com consentimento, numa loja de homologação, sem usar clientes reais.

Nunca reative a sessão global apenas para deixar o health check verde.
Não reinicie ou apague sessões de outros restaurantes.

## Diagnóstico na VM (se a API continuar indisponível)

Execute somente no host Oracle, com acesso autorizado; não compartilhe
tokens, QR codes ou diretórios de sessão:

1. `curl -fS --max-time 10 http://127.0.0.1:3001/health` deve retornar
   `status: ok` e `service: shifuh-whatsapp-api`.
2. `pm2 status` e `pm2 logs whatsapp-api --lines 80` verificam o
   processo e erros de inicialização.
3. `sudo nginx -t` valida o reverse proxy; confirme o roteamento HTTPS
   de `/health` antes de cogitar um restart.
4. No painel autenticado do Shifuh, valide o status da loja-alvo, seu QR
   e o envio controlado da mensagem/OTP. Um serviço saudável pode ter
   uma sessão tenant desconectada.

Se `/health` funcionar na VM mas não pela URL pública, investigue
Nginx, HTTPS, DNS e firewall. Se não funcionar localmente, investigue
PM2, dependências e logs antes de reiniciar qualquer processo.

### Critérios de aceite da etapa

- Health da API OK sem depender da sessão legada;
- validações automáticas e Release Gate aprovados;
- nenhuma credencial ou informação de clientes exposta em logs;
- confirmação separada da sessão tenant e do OTP em teste real;
- operação da VM não alterada sem diagnóstico.
