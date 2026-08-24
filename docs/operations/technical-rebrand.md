# Rebranding tecnico: Gestor Delivery -> Shifuh

Este documento registra a migracao tecnica da marca sem quebrar dados persistidos, integracoes ou automacoes existentes.

## Identidade canonica

- Produto: `Shifuh`
- Dominio publico: `https://www.shifuh.com.br`
- Dominio raiz: `https://shifuh.com.br`
- Icone canonico: `/brand/shifuh-icon.svg`
- Prefixo novo de persistencia no browser: `shifuh:`
- Cookie novo de subtotal da sacola: `shifuh_cart_subtotal`

A metadata global usa o dominio Shifuh como `metadataBase`, e cada vitrine publica gera seu proprio canonical em `www.shifuh.com.br`. O layout raiz nao define um canonical global para evitar que paginas administrativas apontem indevidamente para a home. O `src/app/icon.svg` replica o simbolo oficial para impedir que o favicon legado do App Router concorra com a configuracao de metadata.

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

- [x] Metadata base e canonicals publicos apontam para Shifuh.
- [x] Favicon do App Router usa o simbolo Shifuh.
- [x] Landing page usa a marca oficial no cabecalho.
- [x] URL publica de referencia usa `www.shifuh.com.br`.
- [x] User-Agent do roteamento usa Shifuh.
- [x] Sacolas antigas migram sem perda para `shifuh:`.
- [x] Cookie novo e emitido com compatibilidade temporaria do cookie antigo.
- [x] Cron canonico novo criado sem remover o arquivo legado da VM.
- [ ] Confirmar em producao a migracao de uma sacola criada antes do rollout.
- [ ] Remover o dual-write do cookie legado depois da janela de compatibilidade.
- [ ] Planejar renome de repositorio/projeto/package em uma janela dedicada.
