# Rebranding tecnico: Gestor Delivery -> Shifuh

Este documento registra a migracao tecnica da marca sem quebrar dados persistidos, integracoes ou automacoes existentes.

## Estado atual

A identidade publica e comercial do Shifuh esta ativa em producao. O rollout tecnico foi mergeado pelo PR #104 e a landing, o login e a metadata comercial pelo PR #105. Em 24/08/2026, `www.shifuh.com.br`, o redirect do dominio raiz, favicon, canonicals e as rotas publicas principais foram validados no deploy de producao.

A etapa final de identificadores tecnicos foi iniciada depois dessa validacao. O package raiz ja usa o nome canonico `shifuh` e o repositorio GitHub foi renomeado para `GUKH7/Shifuh`. Antes do rename do projeto Vercel, a integracao Git deve ser validada com um Preview disparado por commit no repositorio ja renomeado.

## Identidade canonica

- Produto: `Shifuh`
- Dominio publico: `https://www.shifuh.com.br`
- Dominio raiz: `https://shifuh.com.br`
- Package raiz: `shifuh`
- Repositorio GitHub: `GUKH7/Shifuh`
- Projeto Vercel alvo: `shifuh`
- Icone canonico: `/brand/shifuh-icon.svg`
- Prefixo novo de persistencia no browser: `shifuh:`
- Cookie novo de subtotal da sacola: `shifuh_cart_subtotal`

As vitrines publicas geram canonical em `www.shifuh.com.br`. O `src/app/icon.svg` replica o simbolo oficial para impedir que o favicon legado do App Router concorra com o icone configurado pela aplicacao.

A landing, o login e o posicionamento comercial de metadata ja foram incorporados a `main` e publicados. O isolamento em branch separada foi usado apenas durante o rollout para evitar conflito com a migracao tecnica.

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

- `APP_BASE_URL` de referencia usa `https://www.shifuh.com.br`.
- Chamadas ao OSRM se identificam como `Shifuh/1.0 (+https://www.shifuh.com.br)`.
- Novas instalacoes Oracle devem usar `ops/oracle/shifuh.cron`.
- `ops/oracle/gestor-delivery.cron` fica temporariamente como alias de compatibilidade ate confirmar a VM instalada.

## Corte dos identificadores de infraestrutura

A migracao final deve preservar os IDs dos recursos e os dominios publicos. A ordem operacional e:

1. alterar o package raiz de `gestor-delivery` para `shifuh` e validar CI/Preview;
2. renomear o repositorio GitHub de `GUKH7/gestor_delivery` para `GUKH7/Shifuh`;
3. confirmar que o redirect do GitHub e a integracao da Vercel continuam apontando para o mesmo repositorio;
4. renomear o projeto Vercel de `gestor-delivery` para `shifuh`, preservando `www.shifuh.com.br` e `shifuh.com.br`;
5. disparar e validar um deploy de `main` depois dos renomes;
6. validar `/`, `/admin/login`, `/api/health` e observabilidade em producao.

O ID do projeto Vercel, historico de deploys e os dominios publicos nao devem ser recriados: o objetivo e renomear o recurso existente, nao criar outro projeto.

Nomes historicos de migrations permanecem imutaveis para preservar a sequencia do banco. O arquivo `ops/oracle/gestor-delivery.cron` tambem permanece como compatibilidade ate a VM ser verificada.

## Checklist de rollout

- [x] Canonicals das vitrines usam o dominio Shifuh.
- [x] Favicon do App Router usa o simbolo Shifuh.
- [x] URL publica de referencia usa `www.shifuh.com.br`.
- [x] User-Agent do roteamento usa Shifuh.
- [x] Sacolas antigas migram sem perda para `shifuh:`.
- [x] Cookie novo e emitido com compatibilidade temporaria do cookie antigo.
- [x] Cron canonico novo criado sem remover o arquivo legado da VM.
- [x] Landing, login e metadata comercial mergeados e validados em producao.
- [x] `package.json` e `package-lock.json` usam package name `shifuh`.
- [x] Repositorio GitHub renomeado para `GUKH7/Shifuh`, preservando o mesmo recurso.
- [ ] Validar Preview da Vercel disparado por commit apos o rename do GitHub.
- [ ] Renomear projeto Vercel para `shifuh` preservando dominios e projeto existente.
- [ ] Confirmar deploy de `main` apos os renomes de infraestrutura.
- [ ] Confirmar em producao a migracao de uma sacola criada antes do rollout.
- [ ] Remover o dual-write do cookie legado depois da janela de compatibilidade.
- [ ] Confirmar que a VM Oracle usa `shifuh.cron` antes de remover o alias legado.
