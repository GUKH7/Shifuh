# Operacao Oracle

Scripts usados pelo bot principal do WhatsApp na VM Oracle.

## API do WhatsApp

O codigo implantado em `/home/ubuntu/whatsapp-api` esta versionado em `ops/oracle/whatsapp-api`. A API consulta explicitamente a versao atual do WhatsApp Web antes de abrir o socket e usa uma versao de fallback durante falhas temporarias da consulta externa.

A arquitetura tenant-aware usa **uma unica conexao/QR por restaurante**. O mesmo WhatsApp conectado no painel da loja e usado para OTP, atualizacoes de pedido e demais mensagens daquele restaurante.

### Seguranca obrigatoria

A API trabalha em modo fail-closed:

- `WHATSAPP_BOT_API_TOKEN` ou `WHATSAPP_MAIN_API_TOKEN` e obrigatorio;
- sem token, o processo recusa a inicializacao;
- o Node aceita exclusivamente bind em loopback (`127.0.0.1`, `localhost` ou `::1`);
- nao existe opt-in para publicar diretamente a porta do Node;
- rotas globais legacy e rotas `/restaurants/{restaurant_id}/...` possuem rate limit no Express;
- o Nginx aplica uma segunda camada de rate limit antes do Node;
- o reverse proxy publica somente `/health`, as rotas legacy explicitamente listadas, as tres rotas tenant-aware e `/econoapp`; qualquer outra rota recebe `404`;
- `/send-message` valida telefone, limita a mensagem a 4096 caracteres e nao grava o numero completo nos logs;
- o corpo JSON e limitado a 16 KB.

Crie as variaveis a partir de `whatsapp-api/.env.example`. O segredo usado pelo Shifuh em `WHATSAPP_BOT_API_TOKEN` deve ser o mesmo configurado na VM.

Antes de reiniciar:

```bash
cd /home/ubuntu/whatsapp-api
npm test
```

### Topologia de rede

O processo Node nao deve ficar exposto diretamente na Internet:

```text
Shifuh/Vercel -> HTTPS :443 -> Nginx -> 127.0.0.1:3001 -> Baileys
```

Use `whatsapp-api/nginx.conf.example` como base do virtual host HTTPS. Quando o proxy local encaminhar `X-Forwarded-For`, configure `WHATSAPP_TRUST_PROXY=loopback`; a aplicacao somente confia nesse header quando o peer imediato e loopback.

Na VM, execute `whatsapp-api/network-hardening.sh` somente depois de o UFW ja estar ativo e o acesso SSH estar corretamente permitido. O script nao habilita o firewall sozinho para evitar bloquear administradores; ele garante deny para as portas internas 3001/3002 e allow para HTTPS 443.

No OCI NSG/Security List, mantenha a mesma regra arquitetural: **nenhum ingress publico para 3001 ou 3002**. Exponha 443 para o reverse proxy e restrinja SSH ao CIDR administrativo adequado.

## Migrar o QR/conexao existente para uma loja

Nao crie um segundo QR para OTP. Quando a sessao global existente pertencer a um restaurante conhecido, use `migrate-whatsapp-session-to-restaurant.sh` para reaproveitar as credenciais atuais.

O rollout seguro e:

1. coloque na VM a versao tenant-aware de `whatsapp-api/index.js`, `security.js` e dependencias sem reiniciar o processo ainda;
2. atualize o virtual host Nginx para permitir apenas `/restaurants/{uuid}/status`, `/restart` e `/send-message`, valide com `nginx -t`, mas mantenha a sessao atual ativa ate a migracao;
3. execute os testes em `/home/ubuntu/whatsapp-api`;
4. execute `migrate-whatsapp-session-to-restaurant.sh <restaurant_id>`;
5. o script cria backup privado, para somente `whatsapp-api`, copia a sessao para `baileys_restaurant_sessions/<restaurant_id>`, arquiva a pasta global, desativa `WHATSAPP_LEGACY_SESSION_ENABLED` no PM2 e reinicia o processo;
6. valide a rota tenant-aware `/restaurants/<restaurant_id>/status` antes de ativar o novo Send SMS Hook.

O script recusa sobrescrever uma sessao tenant que ja exista e tenta restaurar a pasta global/processo em caso de falha. O diretorio `baileys_auth_info.migrated-*` e o arquivo `pre-tenant-migration-*.tar.gz` devem ser preservados ate o rollout ser confirmado.

`WHATSAPP_LEGACY_SESSION_ENABLED=false` garante que as mesmas credenciais nao sejam abertas simultaneamente por um socket global e um socket da loja.

## Watchdog

`whatsapp-watchdog.sh` consulta `http://127.0.0.1:3001/health`. Se a API nao responder em ate 10 segundos, reinicia somente o processo PM2 `whatsapp-api` e confirma a recuperacao cinco segundos depois.

Quando `alerts.env` esta configurado, uma falha persistente gera apenas um alerta no Telegram. O watchdog grava o estado localmente e envia outra mensagem quando o servico se recupera, evitando notificacoes repetidas.

Crie o arquivo privado a partir de `alerts.env.example`:

```bash
cp alerts.env.example alerts.env
chmod 600 alerts.env
```

Preencha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. O arquivo real nao deve ser versionado.

Agendamento recomendado:

```cron
*/2 * * * * /home/ubuntu/whatsapp-api/ops/whatsapp-watchdog.sh
```

## Backup da sessao

`backup-whatsapp-session.sh` cria um snapshot compactado e privado de `baileys_auth_info` em `/home/ubuntu/backups/whatsapp-api`. A retencao padrao e de 14 dias.

Agendamento recomendado:

```cron
15 3 * * * /home/ubuntu/whatsapp-api/ops/backup-whatsapp-session.sh
```

Os scripts aceitam variaveis de ambiente para substituir caminhos, nome do processo e retencao sem alterar o codigo. O arquivo `shifuh.cron` e o nome canonico para novas instalacoes e reune os agendamentos, direcionando a saida para `/home/ubuntu/whatsapp-api/logs`. O antigo `gestor-delivery.cron` permanece temporariamente como alias de compatibilidade para nao quebrar automacoes ja instaladas na VM.