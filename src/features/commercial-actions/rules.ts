export type CommercialAction = {
  id: string; title: string; description: string; href: string;
  priority: "high" | "medium" | "suggestion"; cta: string;
};
export type CommercialInput = {
  restaurant: Record<string, unknown>;
  categories: Array<{id: string; name: string | null; is_active: boolean | null}>;
  products: Array<{id: string; name: string | null; is_active: boolean | null; category_id: string | null; price: number | null}>;
};
const validName = (value: unknown) => typeof value === "string" && value.trim().length > 0;

// Advisory, read-only rules: never assert that a campaign was published or performed.
export function getCommercialActions({restaurant, categories, products}: CommercialInput): CommercialAction[] {
  const actions: CommercialAction[] = [];
  const activeCategories = new Set(categories.filter(c => c.is_active !== false && validName(c.name)).map(c => c.id));
  const sellable = products.filter(p => p.is_active !== false && activeCategories.has(p.category_id ?? "") && validName(p.name) && typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0);
  const unavailable = products.filter(p => p.is_active === false);
  if (!validName(restaurant.name) || !validName(restaurant.slug)) {
    actions.push({id:"identity",title:"Finalize a identidade da loja",description:"Confira nome e link público antes de divulgar sua vitrine.",href:"/admin/settings?setup=identity",priority:"high",cta:"Configurar loja"});
  }
  if (sellable.length === 0) {
    actions.push({id:"catalog",title:"Prepare seu cardápio para vender",description:"É necessário ter pelo menos uma categoria ativa e um produto disponível com preço válido.",href:"/admin/menu",priority:"high",cta:"Abrir cardápio"});
  } else if (unavailable.length > 0) {
    actions.push({id:"unavailable",title:"Revise produtos indisponíveis",description:`${unavailable.length} produto(s) estão inativos. Confira se devem continuar ocultos antes de divulgar a loja.`,href:"/admin/menu",priority:"medium",cta:"Revisar produtos"});
  }
  if (sellable.length > 0 && validName(restaurant.slug)) {
    actions.push({id:"storefront",title:"Confira a vitrine como cliente",description:"Revise imagens, preços e fluxo de compra antes de compartilhar seu link.",href:"/"+encodeURIComponent(String(restaurant.slug).trim()),priority:"suggestion",cta:"Ver vitrine"});
  }
  actions.push({id:"promotions",title:"Planeje uma campanha de vendas",description:"Consulte as promoções e cupons existentes antes de criar uma nova oferta.",href:"/admin/promotions",priority:"suggestion",cta:"Ver promoções"});
  actions.push({id:"loyalty",title:"Acompanhe a fidelidade",description:"Revise a participação dos clientes e os resultados das recompensas já configuradas.",href:"/admin/promotions",priority:"suggestion",cta:"Ver fidelidade"});
  return actions;
}
