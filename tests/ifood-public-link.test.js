import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isValidIfoodPublicUrl,
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
  });
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
  assert.match(importRoute, /if \(importStoreProfile\)/);
  assert.match(importRoute, /is_active: importedPrice > 0/);
});
