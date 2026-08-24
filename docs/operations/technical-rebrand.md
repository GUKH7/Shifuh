# Rebranding tecnico: Gestor Delivery -> Shifuh

Este documento registra a migracao tecnica da marca sem quebrar dados persistidos, integracoes ou automacoes existentes.

## Identidade canonica

- Produto: `Shifuh`
- Dominio publico: `https://www.shifuh.com.br`
- Dominio raiz: `https://shifuh.com.br`
- Icone canonico: `/brand/shifuh-icon.svg`
- Prefixo novo de persistencia no browser: `shifuh:`
- Cookie novo de subtotal da sacola: `shifuh_cart_subtotal`

As vitrines publicas geram canonical em `www.shifuh.com.br`. O `src/app/icon.svg` replica o simbolo oficial para impedir que o favicon legado do App Router concorra com o icone configurado pela aplicacao.

A landing e o posicionamento comercial de metadata estao sendo tratados separadamente na branch `product/rebuild-landing-shifuh`; este rollout tecnico evita modificar `src/app/page.tsx` e `src/app/layout.tsx` para nao criar conflito entre trabalhos paralelos.

## Migracao de persistencia

A sacola historicamente foi gravada em `gestor-delivery:cart:<slug>`. Durante a hidratacao, o hook da vitrine:

1. procura primeiro a chave canonica `shifuh:cart:<slug>`;
2. se ela nao existir, le a chave legada;
3. valida o JSON e restaura a sacola;
4. grava o mesmo conteudo na chave Shifuh;
5. somente depois de a nova gravacao ter sucesso remove a chave legada.

Assim, uma falha de armazenamento nao apaga a unica copia da sacola.

O cookie `gestor_cart_subtotal` continua em dual-write temporario junto com `shifuh_cart_subtotal`. Isso protege consumidores server-side desconhecidos durante a janela de migracao. A remocao do cookie antigo deve ocorrer apenas depois de confirmar em producao que nenhum consumidor ainda o consulta.

## URLs e identificacao externa

- `APP_BASE_URL` de referencia passa a ser `https://www.shifuh.com.br`.
- Chamadas ao OSRM se identificam como `Shifuh/1.0 (+https://www.shifuh.com.br)`.
- Novas instalacoes Oracle devem usar `ops/oracle/shifuh.cron`.
- `ops/oracle/gestor-delivery.cron` fica temporariamente como alias de compatibilidade.

## Identificadores tecnicos mantidos temporariamente

Os itens abaixo nao sao exibidos ao cliente e nao devem ser renomeados no mesmo rollout sem mapear dependencias externas:

- repositorio GitHub `GUKH7/gestor_delivery`;
- projeto Vercel `gestor-delivery` e aliases tecnicos gerados pela Vercel;
- `package.json`/`package-lock.json` com package name `gestor-delivery`;
- nomes historicos de recursos externos que possam ser referenciados por CI, webhooks, scripts ou dashboards.

A regra e migrar esses identificadores em etapas separadas, mantendo redirects/aliases quando o provedor permitir.

## Checklist de rollout

- [x] Canonicals das vitrines usam o dominio Shifuh.
- [x] Favicon do App Router usa o simbolo Shifuh.
- [x] URL publica de referencia usa `www.shifuh.com.br`.
- [x] User-Agent do roteamento usa Shifuh.
- [x] Sacolas antigas migram sem perda para `shifuh:`.
- [x] Cookie novo e emitido com compatibilidade temporaria do cookie antigo.
- [x] Cron canonico novo criado sem remover o arquivo legado da VM.
- [x] Landing/metadata comercial isolados da migracao tecnica para evitar conflito de branches.
- [ ] Confirmar em producao a migracao de uma sacola criada antes do rollout.
- [ ] Remover o dual-write do cookie legado depois da janela de compatibilidade.
- [ ] Planejar renome de repositorio/projeto/package em uma janela dedicada.
