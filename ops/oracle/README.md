# Operacao Oracle

Scripts usados pelo bot principal do WhatsApp na VM Oracle.

## API do WhatsApp

O codigo implantado em `/home/ubuntu/whatsapp-api` esta versionado em
`ops/oracle/whatsapp-api`. A API consulta explicitamente a versao atual do
WhatsApp Web antes de abrir o socket e renova essa informacao apos erros 405.
Uma versao de fallback mantem a inicializacao disponivel durante falhas
temporarias na consulta externa.

### Seguranca obrigatoria

A API trabalha em modo fail-closed:

- `WHATSAPP_BOT_API_TOKEN` ou `WHATSAPP_MAIN_API_TOKEN` e obrigatorio;
- sem token, o processo recusa a inicializacao;
- por padrao o Node escuta somente em `127.0.0.1:3001`;
- bind publico exige `WHATSAPP_ALLOW_PUBLIC_BIND=true` de forma explicita e nao e recomendado;
- `/status`, `/restart`, `/send-message` e `/econoapp` possuem rate limit por origem;
- `/send-message` valida telefone, limita a mensagem a 4096 caracteres e nao grava o numero completo nos logs;
- o corpo JSON e limitado a 16 KB.

Crie as variaveis do processo a partir de `whatsapp-api/.env.example`. O mesmo
segredo usado pelo Shifuh em `WHATSAPP_BOT_API_TOKEN` deve existir na VM.

Execute a validacao antes de reiniciar o processo:

```bash
cd /home/ubuntu/whatsapp-api
npm test
```

### Topologia de rede recomendada

O processo Node nao deve ficar exposto diretamente na Internet:

```text
Shifuh/Vercel -> HTTPS :443 -> Nginx/Caddy -> 127.0.0.1:3001 -> Baileys
```

Use `whatsapp-api/nginx.conf.example` como referencia para o reverse proxy.
Quando houver proxy local, configure `WHATSAPP_TRUST_PROXY=loopback` para que o
rate limiter reconheca o IP encaminhado pelo proxy sem confiar em headers vindos
diretamente da Internet.

Na Oracle Cloud e no firewall da VM, a porta TCP `3001` deve permanecer fechada
para ingress externo. Mantenha publicamente apenas o necessario, normalmente
SSH restrito para administracao e HTTPS `443` para o proxy. A regra do OCI e o
firewall do sistema operacional precisam ser verificados na propria VM/console;
nao basta o Node estar configurado corretamente.

Ao implantar uma atualizacao, preserve `baileys_auth_info`, as variaveis do PM2
e os arquivos atuais como backup antes de reiniciar apenas `whatsapp-api`.

## Watchdog

`whatsapp-watchdog.sh` consulta `http://127.0.0.1:3001/health`. Se a API nao
responder em ate 10 segundos, reinicia somente o processo PM2 `whatsapp-api` e
confirma a recuperacao cinco segundos depois.

Quando `alerts.env` esta configurado, uma falha persistente gera apenas um
alerta no Telegram. O watchdog grava o estado localmente e envia outra mensagem
quando o servico se recupera, evitando notificacoes repetidas a cada execucao.

Crie o arquivo privado a partir de `alerts.env.example`:

```bash
cp alerts.env.example alerts.env
chmod 600 alerts.env
```

Preencha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. O arquivo real nao deve ser
versionado.

Agendamento recomendado:

```cron
*/2 * * * * /home/ubuntu/whatsapp-api/ops/whatsapp-watchdog.sh
```

## Backup da sessao

`backup-whatsapp-session.sh` cria um snapshot compactado e privado de
`baileys_auth_info` em `/home/ubuntu/backups/whatsapp-api`. A retencao padrao e
de 14 dias.

Agendamento recomendado:

```cron
15 3 * * * /home/ubuntu/whatsapp-api/ops/backup-whatsapp-session.sh
```

Os scripts aceitam variaveis de ambiente para substituir caminhos, nome do
processo e retencao sem alterar o codigo.

O arquivo `gestor-delivery.cron` reune os dois agendamentos e direciona a saida
para `/home/ubuntu/whatsapp-api/logs`.
