import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) {
    throw new Error(`Trecho não encontrado: ${label}`);
  }
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Trecho duplicado: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function patch(path, transforms) {
  let source = read(path);
  for (const transform of transforms) {
    source = replaceOnce(source, transform.before, transform.after, `${path}: ${transform.label}`);
  }
  write(path, source);
}

for (const path of [
  "src/features/storefront/types.ts",
  "src/features/settings/types.ts",
]) {
  patch(path, [
    {
      label: "tipagem de links dos banners",
      before: `  promo_text: string;\n}`,
      after: `  promo_text: string;\n  banner_product_links: Record<string, string>;\n}`,
    },
  ]);
}

for (const path of [
  "src/features/storefront/constants.ts",
  "src/features/settings/constants.ts",
]) {
  patch(path, [
    {
      label: "valor padrão de links dos banners",
      before: `  promo_text: "Promo do dia",\n};`,
      after: `  promo_text: "Promo do dia",\n  banner_product_links: {},\n};`,
    },
  ]);
}

patch("src/features/storefront/use-storefront.ts", [
  {
    label: "normalizar tema inicial",
    before: `  const [storefrontTheme, setStorefrontTheme] = useState<StorefrontTheme>(\n    initialStorefront?.storefrontTheme ?? DEFAULT_STOREFRONT_THEME,\n  );`,
    after: `  const [storefrontTheme, setStorefrontTheme] = useState<StorefrontTheme>({\n    ...DEFAULT_STOREFRONT_THEME,\n    ...(initialStorefront?.storefrontTheme ?? {}),\n  });`,
  },
  {
    label: "rotação automática do carrossel",
    before: `  useEffect(() => {\n    const timer = setInterval(() => {\n      setBanners((prev) => {\n        if (prev.length > 1) {\n          setCurrentBanner((current) => (current + 1) % prev.length);\n        }\n        return prev;\n      });\n    }, 5000);\n\n    return () => clearInterval(timer);\n  }, []);`,
    after: `  useEffect(() => {\n    if (banners.length === 0) {\n      setCurrentBanner(0);\n      return;\n    }\n\n    setCurrentBanner((current) => Math.min(current, banners.length - 1));\n  }, [banners.length]);\n\n  useEffect(() => {\n    if (banners.length <= 1) return;\n\n    const timer = window.setInterval(() => {\n      setCurrentBanner((current) => (current + 1) % banners.length);\n    }, 5000);\n\n    return () => window.clearInterval(timer);\n  }, [banners.length]);`,
  },
  {
    label: "expor controle manual do banner",
    before: `    banners,\n    currentBanner,\n    storefrontHeadline,`,
    after: `    banners,\n    currentBanner,\n    setCurrentBanner,\n    storefrontHeadline,`,
  },
]);

patch("src/features/settings/SettingsWorkspace.tsx", [
  {
    label: "estado de produtos da vitrine",
    before: `  const [banners, setBanners] = useState<string[]>([]);\n  const [storefrontHeadline, setStorefrontHeadline] = useState("");`,
    after: `  const [banners, setBanners] = useState<string[]>([]);\n  const [storefrontProducts, setStorefrontProducts] = useState<Array<{ id: string; name: string }>>([]);\n  const [storefrontHeadline, setStorefrontHeadline] = useState("");`,
  },
  {
    label: "carregar produtos ativos para vínculo",
    before: `        setStorefrontTheme({\n          ...DEFAULT_STOREFRONT_THEME,\n          ...(data.storefront_theme || {}),\n        });\n        setAddress({`,
    after: `        setStorefrontTheme({\n          ...DEFAULT_STOREFRONT_THEME,\n          ...(data.storefront_theme || {}),\n        });\n\n        const { data: activeStorefrontProducts } = await supabase\n          .from("products")\n          .select("id, name")\n          .eq("restaurant_id", data.id)\n          .eq("is_active", true)\n          .order("name");\n        setStorefrontProducts(activeStorefrontProducts || []);\n\n        setAddress({`,
  },
  {
    label: "helpers de vínculo e remoção de banner",
    before: `  const updateStorefrontTheme = <K extends keyof StorefrontTheme>(\n    field: K,\n    value: StorefrontTheme[K],\n  ) => {\n    setStorefrontTheme((current) => ({ ...current, [field]: value }));\n  };`,
    after: `  const updateStorefrontTheme = <K extends keyof StorefrontTheme>(\n    field: K,\n    value: StorefrontTheme[K],\n  ) => {\n    setStorefrontTheme((current) => ({ ...current, [field]: value }));\n  };\n\n  const updateBannerProductLink = (bannerUrl: string, productId: string) => {\n    setStorefrontTheme((current) => {\n      const nextLinks = { ...(current.banner_product_links || {}) };\n      if (productId) nextLinks[bannerUrl] = productId;\n      else delete nextLinks[bannerUrl];\n      return { ...current, banner_product_links: nextLinks };\n    });\n  };\n\n  const removeBanner = (bannerUrl: string, index: number) => {\n    setBanners((current) => current.filter((_, bannerIndex) => bannerIndex !== index));\n    setStorefrontTheme((current) => {\n      const nextLinks = { ...(current.banner_product_links || {}) };\n      delete nextLinks[bannerUrl];\n      return { ...current, banner_product_links: nextLinks };\n    });\n  };`,
  },
  {
    label: "explicar carrossel",
    before: `                    <span className="mt-1 text-xs text-gray-400">Suba imagens para destacar promoções. Você poderá recortar antes de salvar.</span>`,
    after: `                    <span className="mt-1 text-xs text-gray-400">Suba imagens para destacar promoções. Com mais de uma imagem, o topo vira um carrossel automaticamente.</span>`,
  },
  {
    label: "editor de vínculo por banner",
    before: `                  <div className="space-y-2">\n                    {banners.map((banner, index) => (\n                      <div key={index} className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white p-2.5">\n                        <div className="flex items-center gap-3">\n                          <img src={banner} className="h-10 w-16 rounded-xl object-cover" />\n                          <span className="text-sm font-medium text-gray-600">Banner {index + 1}</span>\n                        </div>\n                        <button onClick={() => setBanners(banners.filter((_, i) => i !== index))} className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">\n                          <Trash2 size={16} />\n                        </button>\n                      </div>\n                    ))}\n                    {banners.length === 0 && <p className="text-center text-sm text-gray-400">Nenhum banner enviado.</p>}\n                  </div>`,
    after: `                  <div className="space-y-2">\n                    {banners.map((banner, index) => (\n                      <div key={banner} className="rounded-2xl border border-[var(--line)] bg-white p-3">\n                        <div className="flex items-start gap-3">\n                          <img\n                            src={banner}\n                            alt={\`Prévia do banner \${index + 1}\`}\n                            className="h-14 w-24 shrink-0 rounded-xl object-cover"\n                          />\n                          <div className="min-w-0 flex-1">\n                            <div className="flex items-start justify-between gap-2">\n                              <div>\n                                <p className="text-sm font-bold text-gray-700">Banner {index + 1}</p>\n                                <p className="mt-0.5 text-[11px] text-gray-400">Opcionalmente, abra um produto ao tocar na imagem.</p>\n                              </div>\n                              <button\n                                type="button"\n                                onClick={() => removeBanner(banner, index)}\n                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]"\n                                aria-label={\`Remover banner \${index + 1}\`}\n                              >\n                                <Trash2 size={16} />\n                              </button>\n                            </div>\n                            <label className="mt-3 block">\n                              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Produto ao clicar</span>\n                              <select\n                                value={storefrontTheme.banner_product_links?.[banner] || ""}\n                                onChange={(event) => updateBannerProductLink(banner, event.target.value)}\n                                className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[#fcfaf7] px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-[var(--brand)]"\n                                aria-label={\`Produto vinculado ao banner \${index + 1}\`}\n                              >\n                                <option value="">Sem produto vinculado</option>\n                                {storefrontProducts.map((product) => (\n                                  <option key={product.id} value={product.id}>{product.name}</option>\n                                ))}\n                              </select>\n                            </label>\n                          </div>\n                        </div>\n                      </div>\n                    ))}\n                    {banners.length === 0 && <p className="text-center text-sm text-gray-400">Nenhum banner enviado.</p>}\n                  </div>`,
  },
]);

patch("src/features/storefront/StorefrontPage.tsx", [
  {
    label: "ícones do carrossel",
    before: `  ChevronDown,\n  Phone,\n  UserRound,`,
    after: `  ChevronDown,\n  ChevronLeft,\n  ChevronRight,\n  Phone,\n  UserRound,`,
  },
  {
    label: "refs para gesto de swipe",
    before: `  const categoryNavRef = useRef<HTMLDivElement>(null);`,
    after: `  const categoryNavRef = useRef<HTMLDivElement>(null);\n  const bannerTouchStartXRef = useRef<number | null>(null);\n  const bannerIgnoreClickUntilRef = useRef(0);`,
  },
  {
    label: "controle manual vindo do hook",
    before: `    banners,\n    currentBanner,\n    storefrontHeadline,`,
    after: `    banners,\n    currentBanner,\n    setCurrentBanner,\n    storefrontHeadline,`,
  },
  {
    label: "estado derivado e interações do carrossel",
    before: `  const usesHeroBanner =\n    storefrontTheme.show_banners && (banners.length > 0 || Boolean(restaurant?.image_url));\n  const heroHeightClass =`,
    after: `  const usesHeroBanner =\n    storefrontTheme.show_banners && (banners.length > 0 || Boolean(restaurant?.image_url));\n  const currentBannerUrl = banners[currentBanner] || "";\n  const currentBannerProductId = currentBannerUrl\n    ? storefrontTheme.banner_product_links?.[currentBannerUrl] || ""\n    : "";\n  const currentBannerProduct = currentBannerProductId\n    ? products.find((product) => product.id === currentBannerProductId && product.is_active) || null\n    : null;\n  const hasBannerCarousel = usesHeroBanner && banners.length > 1;\n  const moveBanner = (direction: number) => {\n    if (banners.length <= 1) return;\n    setCurrentBanner((current) => (current + direction + banners.length) % banners.length);\n  };\n  const handleBannerTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {\n    bannerTouchStartXRef.current = event.touches[0]?.clientX ?? null;\n  };\n  const handleBannerTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {\n    const startX = bannerTouchStartXRef.current;\n    bannerTouchStartXRef.current = null;\n    if (startX === null || banners.length <= 1) return;\n\n    const endX = event.changedTouches[0]?.clientX ?? startX;\n    const deltaX = endX - startX;\n    if (Math.abs(deltaX) < 45) return;\n\n    bannerIgnoreClickUntilRef.current = Date.now() + 500;\n    moveBanner(deltaX < 0 ? 1 : -1);\n  };\n  const handleBannerProductClick = () => {\n    if (!currentBannerProduct || Date.now() < bannerIgnoreClickUntilRef.current) return;\n    openProduct(currentBannerProduct);\n  };\n  const heroHeightClass =`,
  },
  {
    label: "render do carrossel no hero",
    before: `            <div className={\`relative bg-gray-200 \${heroHeightClass}\`}>\n            {usesHeroBanner && banners.length > 0 ? (\n              <Image\n                key={banners[currentBanner]}\n                src={banners[currentBanner]}\n                alt={\`Banner da \${restaurant.name}\`}\n                fill\n                priority\n                sizes="(max-width: 1024px) 100vw, 1024px"\n                className="object-cover"\n              />\n            ) : usesHeroBanner && restaurant.image_url ? (\n              <Image src={restaurant.image_url} alt={restaurant.name} fill priority sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />\n            ) : (\n              <div className="h-full w-full" style={{ background: heroBackground }} />\n            )}\n            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />\n            <div className={\`absolute inset-x-0 bottom-0 p-4 sm:p-7 \${\n              storefrontTheme.hero_style === "split" ? "text-right" : ""\n            }\`}>`,
    after: `            <div\n              className={\`relative bg-gray-200 \${heroHeightClass}\`}\n              onTouchStart={handleBannerTouchStart}\n              onTouchEnd={handleBannerTouchEnd}\n            >\n            {usesHeroBanner && banners.length > 0 ? (\n              <Image\n                key={currentBannerUrl}\n                src={currentBannerUrl}\n                alt={\`Banner da \${restaurant.name}\`}\n                fill\n                priority\n                sizes="(max-width: 1024px) 100vw, 1024px"\n                className="object-cover"\n              />\n            ) : usesHeroBanner && restaurant.image_url ? (\n              <Image src={restaurant.image_url} alt={restaurant.name} fill priority sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />\n            ) : (\n              <div className="h-full w-full" style={{ background: heroBackground }} />\n            )}\n            {currentBannerProduct && (\n              <button\n                type="button"\n                data-banner-product-link\n                onClick={handleBannerProductClick}\n                className="absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white"\n                aria-label={\`Ver produto \${currentBannerProduct.name}\`}\n              />\n            )}\n            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />\n            {currentBannerProduct && (\n              <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-1.5 text-[10px] font-black text-gray-800 shadow-sm backdrop-blur sm:right-4 sm:top-4 sm:text-xs">\n                Ver produto <ArrowRight size={13} />\n              </span>\n            )}\n            <div className={\`pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-7 \${\n              hasBannerCarousel ? "pb-11 sm:pb-12" : ""\n            } \${\n              storefrontTheme.hero_style === "split" ? "text-right" : ""\n            }\`}>`,
  },
  {
    label: "controles e indicadores do carrossel",
    before: `              )}\n            </div>\n            </div>\n          </div>`,
    after: `              )}\n            </div>\n            {hasBannerCarousel && (\n              <>\n                <button\n                  type="button"\n                  onClick={() => moveBanner(-1)}\n                  className="absolute left-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:flex"\n                  aria-label="Banner anterior"\n                >\n                  <ChevronLeft size={20} />\n                </button>\n                <button\n                  type="button"\n                  onClick={() => moveBanner(1)}\n                  className="absolute right-2 top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:flex"\n                  aria-label="Próximo banner"\n                >\n                  <ChevronRight size={20} />\n                </button>\n                <div className="absolute bottom-0 left-1/2 z-30 flex max-w-[80%] -translate-x-1/2 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">\n                  {banners.map((banner, index) => (\n                    <button\n                      key={banner}\n                      type="button"\n                      onClick={() => setCurrentBanner(index)}\n                      className="flex h-11 w-11 shrink-0 items-center justify-center"\n                      aria-label={\`Exibir banner \${index + 1}\`}\n                      aria-current={index === currentBanner ? "true" : undefined}\n                    >\n                      <span\n                        className={\`block h-1.5 rounded-full bg-white shadow-sm transition-all \${\n                          index === currentBanner ? "w-5 opacity-100" : "w-1.5 opacity-65"\n                        }\`}\n                      />\n                    </button>\n                  ))}\n                </div>\n              </>\n            )}\n            </div>\n          </div>`,
  },
]);

const testPath = "tests/storefront-banner-carousel.test.js";
write(testPath, `const assert = require("node:assert/strict");\nconst fs = require("node:fs");\nconst path = require("node:path");\nconst test = require("node:test");\n\nconst root = path.join(__dirname, "..");\nconst storefrontPage = fs.readFileSync(path.join(root, "src/features/storefront/StorefrontPage.tsx"), "utf8");\nconst storefrontHook = fs.readFileSync(path.join(root, "src/features/storefront/use-storefront.ts"), "utf8");\nconst settings = fs.readFileSync(path.join(root, "src/features/settings/SettingsWorkspace.tsx"), "utf8");\nconst storefrontTypes = fs.readFileSync(path.join(root, "src/features/storefront/types.ts"), "utf8");\n\ntest("carrossel do topo mantém rotação automática e permite navegação manual", () => {\n  assert.match(storefrontHook, /setCurrentBanner/);\n  assert.match(storefrontHook, /5000/);\n  assert.match(storefrontPage, /Banner anterior/);\n  assert.match(storefrontPage, /Próximo banner/);\n  assert.match(storefrontPage, /handleBannerTouchStart/);\n  assert.match(storefrontPage, /Exibir banner/);\n});\n\ntest("banner pode abrir um produto vinculado sem sair da vitrine", () => {\n  assert.match(storefrontTypes, /banner_product_links: Record<string, string>/);\n  assert.match(storefrontPage, /data-banner-product-link/);\n  assert.match(storefrontPage, /openProduct\\(currentBannerProduct\\)/);\n  assert.match(settings, /Produto ao clicar/);\n  assert.match(settings, /Sem produto vinculado/);\n  assert.match(settings, /updateBannerProductLink/);\n});\n\ntest("remoção do banner também remove seu vínculo de produto", () => {\n  assert.match(settings, /delete nextLinks\\[bannerUrl\\]/);\n  assert.match(settings, /removeBanner\\(banner, index\\)/);\n});\n`);

console.log("Carrossel e vínculos de banners aplicados com sucesso.");
