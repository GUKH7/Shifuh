# Operacao Oracle

Scripts usados pelo bot principal do WhatsApp na VM Oracle.

## API do WhatsApp

O codigo implantado em `/home/ubuntu/whatsapp-api` esta versionado em `ops/oracle/whatsapp-api`. A API consulta explicitamente a versao atual do WhatsApp Web antes de abrir o socket e usa uma versao de fallback durante falhas temporarias da consulta externa.

### Seguranca obrigatoria

A API trabalha em modo fail-closed:

- `WHATSAPP_BOT_API_TOKEN` ou `WHATSAPP_MAIN_API_TOKEN` e obrigatorio;
- sem token, o processo recusa a inicializacao;
- o Node aceita exclusivamente bind em loopback (`127.0.0.1`, `localhost` ou `::1`);
- nao existe mais opt-in para publicar diretamente a porta do Node;
- `/status`, `/restart`, `/send-message` e `/econoapp` possuem rate limit no Express;
- o Nginx aplica uma segunda camada de rate limit antes do Node;
- o reverse proxy publica somente `/health`, `/status`, `/restart`, `/send-message` e `/econoapp`; qualquer outra rota recebe `404`;
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

No OCI NSG/Security List, mantenha a mesma regra arquitetural: **nenhum ingress publico para 3001 ou 3002**. Exponha 443 para o reverse proxy e restrinja SSH ao CIDR administrativo adequado. Como as regras OCI pertencem a infraestrutura externa ao repositorio, a validacao final precisa ser feita na console/VM Oracle.

Ao implantar uma atualizacao, preserve `baileys_auth_info`, as variaveis do PM2 e os arquivos atuais como backup antes de reiniciar apenas `whatsapp-api`.

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
