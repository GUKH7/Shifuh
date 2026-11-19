# 99Food — Etapa 3: contrato oficial pendente, persistência local preparada

## Evidências oficiais disponíveis (19/11/2026)

- Portal do desenvolvedor 99Food: https://developer-food.99app.com/pt-BR/home
  - Confirma fluxo de certificação, aplicação de teste e habilitação do parceiro.
  - A documentação interativa depende de JavaScript/autorização e **não foi possível
    confirmar o contrato concreto** de payload, cabeçalhos, assinaturas,
    autenticação, retries e confirmação dos eventos.
- Perfil 99Food na Open Delivery:
  https://aderentes.opendelivery.com.br/companies/68f696345e89f79a1563008a
  - Registra ambiente sandbox, recebimento por webhook e polling e aderência
    aos padrões de pedidos e merchant.
- **Não reutilizar a assinatura de 99Entrega**
  (https://entrega-api.99app.com/doc/webhook.html): 99Entrega é outro
  produto. Também não reutilizar HMAC, schemas ou ACK do iFood por analogia.

## Implementado na branch (sem acesso à produção)

1. Migration **ainda não aplicada no Supabase real**
   `supabase/migrations/20261119150000_99food_staged_transactional_ingestion.sql`.
   Criará exclusivamente staging 99Food com registros de merchants,
   pedidos e eventos separados do fluxo operacional e do iFood.
2. Merchant tem vínculo único com restaurante e fica desabilitado por
   padrão. Não há vínculo válido criado em produção.
3. A função `ingest_99food_staged_event` exige `service_role` do Supabase,
   revalida o vínculo ativo, serializa alterações concorrentes por
   restaurante/pedido com lock transacional, deduplica eventos via chave
   única e grava estado+ledger na mesma transação. Um mesmo ID com conteúdo
   conflitante falha, sem confirmação.
4. RLS ativado com ausência de políticas públicas: visitantes e usuários
   autenticados não têm acesso a essas tabelas.
5. `src/lib/99food/transactional-store.ts`: adaptador servidor para RPC,
   que valida canal, restaurante, IDs e chave do evento. Sem HTTP público,
   envio de ACK, sincronização de pedidos reais ou credenciais do provedor.
6. `tests/99food-transactional-store.test.cjs`: testes com mocks, recusa
   de escopo incorreto e propagação de erros.
7. `scripts/99food-transactional-local-homologation.mjs`: script **somente
   local** para PostgreSQL/Supabase descartável; aceita apenas
   `http://127.0.0.1`, `http://localhost` ou `http://[::1]`; simula 25
   workers concorrentes, isolamento entre restaurantes, eventos tardios,
   status terminais e rejeição de anon/merchant não autorizado.
   Requer `FOOD99_LOCAL_E2E=1`, Supabase local inicializado e
   `node scripts/e2e-seed.mjs` executado primeiro.

**Limitação desta entrega:** não foi possível alterar o workflow
`.github/workflows/ci.yml` para executar automaticamente o script SQL
específico (ação de escrita bloqueada). O workflow existente executa
`supabase db reset` sobre um Supabase local descartável, de modo que a
migration é testada quanto à aplicação, mas o novo script E2E de
concorrência **não é chamado automaticamente**. Não considerar este teste
E2E aprovado até sua execução separada em ambiente local autorizado.

## Checklist antes de conectar 99Food real

- Obter conta de integrador 99Food e aplicativo oficial de sandbox.
- Obter o schema e status oficiais de eventos, método de verificação da
  origem, cadência, retries e ACK (sem supor compatibilidade iFood/99Entrega).
- Implementar autenticação/autorização de merchant com segredos geridos
  apenas no servidor. Rejeitar payloads e assinaturas inválidos **antes**
  do adaptador e da função SQL.
- Substituir explicitamente o adaptador de fixtures por um adaptador
  oficial com testes de contrato baseados na documentação autorizada.
- Homologar corrida SQL e reconciliação no Supabase local, sem migrar
  nem consumir dados reais antes de aprovação separada.
- Revisar, com autorização, a migration para implantação futura.
  Não criar webhook público nem emitir ACK antes de persistir com sucesso.

## Preservação de infraestrutura

- Sem rede para 99Food, tokens reais, publicação Vercel, preview, cron,
  replay persistente, merge ou alteração no Supabase remoto.
- A integração atual do iFood permanece sem mudanças.
