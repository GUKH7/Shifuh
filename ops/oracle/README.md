# Operacao Oracle

Scripts usados pelo bot principal do WhatsApp na VM Oracle.

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
