import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hydrateIfoodPublicMenuAddons,
  isValidIfoodPublicUrl,
  normalizeIfoodAddonGroups,
  parseIfoodItemAddonResponse,
  parseIfoodPublicStorePage,
} from "../src/lib/ifood/public-page.ts";

const merchantUuid = "7e1a2e9a-f621-40e1-9966-f625f886d611";
const publicUrl = `https://www.ifood.com.br/delivery/sao-paulo/loja-teste/${merchantUuid}`;

test("aceita somente links públicos HTTPS do domínio iFood", () => {
  assert.equal(isValidIfoodPublicUrl(publicUrl), true);
  assert.equal(
    isValidIfoodPublicUrl(`https://subdominio.ifood.com.br/delivery/loja/${merchantUuid}`),
    true,
  );
  assert.equal(isValidIfoodPublicUrl(`http://www.ifood.com.br/delivery/loja/${merchantUuid}`), false);
  assert.equal(isValidIfoodPublicUrl(`https://ifood.com.br.evil.test/delivery/loja/${merchantUuid}`), false);
  assert.equal(isValidIfoodPublicUrl(`https://evilifood.com.br/delivery/loja/${merchantUuid}`), false);
  assert.equal(isValidIfoodPublicUrl("https://www.ifood.com.br/inicio"), false);
});

test("extrai loja, categoria e produto do HTML público do iFood", () => {
  const nextData = {
    props: {
      pageProps: {
        initialState: {
          restaurant: {
            uuid: merchantUuid,
            name: "Loja Teste",
            menu: [
              {
                id: "category-1",
                name: "Lanches",
                items: [
                  {
                    id: "item-1",
                    name: "Hambúrguer",
                    description: "Pão, carne e queijo",
                    price: 24.9,
                    imageUrl: "https://static.ifood-static.com.br/item.jpg",
                    choices: [
                      {
                        code: "group-1",
                        name: "Escolha o queijo",
                        min: 1,
                        max: 2,
                        garnishItens: [
                          { id: "option-1", description: "Mussarela", unitPrice: 2.5 },
                          { id: "option-2", description: "Cheddar", unitPrice: 3 },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
  const parsed = parseIfoodPublicStorePage(html, publicUrl);

  assert.equal(parsed.merchantUuid, merchantUuid);
  assert.equal(parsed.name, "Loja Teste");
  assert.equal(parsed.menuSections.length, 1);
  assert.equal(parsed.menuSections[0].name, "Lanches");
  assert.deepEqual(parsed.menuSections[0].items[0], {
    id: "item-1",
    name: "Hambúrguer",
    description: "Pão, carne e queijo",
    price: 24.9,
    imageUrl: "https://static.ifood-static.com.br/item.jpg",
    addons: [
      {
        id: "group-1",
        title: "Escolha o queijo",
        required: true,
        min_options: 1,
        max_options: 2,
        options: [
          { id: "option-1", name: "Mussarela", price: 2.5 },
          { id: "option-2", name: "Cheddar", price: 3 },
        ],
      },
    ],
    needsAddonDetails: false,
  });
});

test("extrai complementos da resposta de detalhe do produto", () => {
  const itemId = "item-with-choices";
  const payload = JSON.stringify({
    code: "00",
    data: {
      menu: [
        {
          itens: [
            {
              id: itemId,
              choices: [
                {
                  code: "group-1",
                  name: "Escolha os acompanhamentos",
                  min: 1,
                  max: 2,
                  garnishItens: [
                    { code: "rice", description: "Arroz", unitPrice: 0 },
                    { code: "fries", description: "Batata frita", unitPrice: 4.5 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(parseIfoodItemAddonResponse(payload, itemId), [
    {
      id: "group-1",
      title: "Escolha os acompanhamentos",
      required: true,
      min_options: 1,
      max_options: 2,
      options: [
        { id: "rice", name: "Arroz", price: 0 },
        { id: "fries", name: "Batata frita", price: 4.5 },
      ],
    },
  ]);
});

test("consulta detalhes somente para produtos que sinalizam escolhas", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(
      JSON.stringify({
        data: {
          menu: [
            {
              itens: [
                {
                  id: "meal-1",
                  choices: [
                    {
                      code: "sides",
                      name: "Acompanhamentos",
                      min: 0,
                      max: 1,
                      garnishItens: [{ code: "egg", description: "Ovo", unitPrice: 2 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const hydrated = await hydrateIfoodPublicMenuAddons(
      [
        {
          id: "lunch",
          name: "Almoço",
          items: [
            {
              id: "meal-1",
              name: "Prato feito",
              description: null,
              price: 20,
              imageUrl: null,
              addons: [],
              needsAddonDetails: true,
            },
            {
              id: "drink-1",
              name: "Refrigerante",
              description: null,
              price: 5,
              imageUrl: null,
              addons: [],
              needsAddonDetails: false,
            },
          ],
        },
      ],
      merchantUuid,
      publicUrl,
    );

    assert.equal(requestedUrls.length, 1);
    assert.match(requestedUrls[0], new RegExp(`/items/meal-1$`));
    assert.equal(hydrated[0].items[0].addons[0].options[0].name, "Ovo");
    assert.deepEqual(hydrated[0].items[1].addons, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normaliza complementos no formato optionGroups do catalogo publico", async () => {
  assert.deepEqual(
    normalizeIfoodAddonGroups(
      {
        optionGroups: [
          {
            id: "sizes",
            title: "Tamanho",
            minimumQuantity: 0,
            maximumQuantity: 1,
            options: [{ id: "large", name: "Grande", price: { value: 4.9 } }],
          },
        ],
      },
      "pizza",
    ),
    [
      {
        id: "sizes",
        title: "Tamanho",
        required: false,
        min_options: 0,
        max_options: 1,
        options: [{ id: "large", name: "Grande", price: 4.9 }],
      },
    ],
  );
});

test("a importação iniciada em Cardápios preserva a identidade da loja", () => {
  const menuPage = readFileSync(
    new URL("../src/app/admin/(painel)/menu/page.tsx", import.meta.url),
    "utf8",
  );
  const importRoute = readFileSync(
    new URL("../src/app/api/integrations/ifood/public-link/import/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(menuPage, /Importar cardápio do iFood/);
  assert.match(menuPage, /importStoreProfile:\s*false/);
  assert.match(menuPage, /addonOptionsProcessed/);
  assert.match(importRoute, /if \(importStoreProfile\)/);
  assert.match(importRoute, /is_active: importedPrice > 0/);
  assert.match(importRoute, /addons: importedAddons/);
});

test("o build inclui o Chromium na função de importação pública", () => {
  const nextConfig = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");

  assert.match(nextConfig, /\/api\/integrations\/ifood\/public-link\/import/);
  assert.match(nextConfig, /@sparticuz\/chromium\/bin\/\*\*\/\*/);
});

test("a importação tenta o catálogo direto antes do navegador e respeita a duração da função", () => {
  const importer = readFileSync(
    new URL("../src/lib/ifood/public-menu-importer.ts", import.meta.url),
    "utf8",
  );
  const importRoute = readFileSync(
    new URL("../src/app/api/integrations/ifood/public-link/import/route.ts", import.meta.url),
    "utf8",
  );
  const directProbeIndex = importer.indexOf(
    "publicCatalogProbe = await probePublicCatalogEndpoint",
  );
  const chromiumImportIndex = importer.indexOf(
    'const chromium = (await import("@sparticuz/chromium")).default',
  );

  assert.ok(directProbeIndex >= 0);
  assert.ok(chromiumImportIndex > directProbeIndex);
  assert.match(importer, /AbortSignal\.timeout\(6_000\)/);
  assert.match(importRoute, /export const maxDuration = 120/);
});
