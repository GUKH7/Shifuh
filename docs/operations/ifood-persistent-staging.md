# Preparação da homologação persistente iFood — Shifuh

Status (24/10/2026): a branch persistente Supabase ainda depende de aprovação explícita do custo. Este PR não cria recursos externos e não modifica produção.

## Isolamento obrigatório
- Supabase produção (não utilizar): inpnszjwuwefitljrzrd.
- A Vercel atual compartilha variáveis sensíveis entre Preview e Production; não tratar Preview como staging independente.
- Criar uma branch Supabase sem dados reais e configurar uma instância Vercel isolada, sem copiar credenciais de produção.
- Não copiar pedidos, clientes, números de telefone, tokens, nem credenciais iFood/WhatsApp.
- Começar com replay desligado e fornecedor iFood simulado. Não disparar cron automático ou ACK real.

## Procedimento após autorização do custo
1. Criar branch Supabase shifuh-ifood-homolog vinculada ao projeto e registrar seu novo project_ref.
2. Confirmar que a migração ifood_event_lease_replay existe na branch. Verificar as colunas processing_lease_token e processing_lease_until, o índice idx_ifood_events_lease_ready e a RPC claim_ifood_pending_events.
3. Validar função SECURITY INVOKER e executar como service_role somente; anon e authenticated não podem executar a RPC.
4. Separar a configuração da Vercel em projeto dedicado ou ambiente realmente isolado; não herdar chaves do Preview atual.
5. Com replay desligado, usar somente chaves criadas na branch. Verificar manualmente a origem das chaves, nunca mostrá-las em logs.
6. Executar node scripts/verify-ifood-staging-env.cjs com SHIFUH_ENV=staging, SHIFUH_STAGING_SUPABASE_REF igual ao ref da branch e SHIFUH_STAGING_SERVICE_ROLE_VERIFIED=true somente depois de conferir as chaves.
7. Para validar replay com dados sintéticos, configurar IFOOD_MERCHANT_API_BASE_URL para mock local ou .internal.test; ativar flag somente depois da migração e de aprovação operacional.
8. Conferir quatro cenários: dois eventos do mesmo pedido geram uma ordem, HTTP 504 aplica cooldown sem consumir retry, ACK somente após persistência, dead-letter controlada.
9. Registrar resultados e manter rollback documentado. Não ligar replay de produção como consequência da homologação.

## Diagnóstico dos ACKs antigos
Cinco eventos de pedidos de teste do Restaurante Villa Costa, em três pedidos locais, ainda sem acknowledged_at. O endpoint legado /api/cron/ifood/orders recebe chamadas; a recuperação de ACKs antigos existe no endpoint resiliente. Não enviar ACKs reais sem uma revisão específica e idempotente do fluxo.

## Preflight
O script verifica somente variáveis locais, não conecta a serviços e recusa projeto de produção, URL de branch divergente, credenciais não verificadas, iFood real e WhatsApp real. Não é uma garantia da origem da chave secreta: a verificação manual continua obrigatória.