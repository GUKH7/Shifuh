from pathlib import Path

menu_path = Path('src/app/admin/(painel)/menu/page.tsx')
source = menu_path.read_text(encoding='utf-8')

source = source.replace(
    '  const [isDeletingCategory, setIsDeletingCategory] = useState(false);\n  const [deleteCategoryError, setDeleteCategoryError] = useState("");',
    '  const [isDeletingCategory, setIsDeletingCategory] = useState(false);\n  const [deleteCategoryError, setDeleteCategoryError] = useState("");\n  const [categoryStatusUpdatingId, setCategoryStatusUpdatingId] = useState("");'
)

source = source.replace(
    '  const handleOpenCategoryModal = () => {',
    '''  const toggleCategoryStatus = async (category: any) => {
    if (!category?.id || categoryStatusUpdatingId) return;

    const newStatus = category.is_active === false;
    setCategoryStatusUpdatingId(category.id);
    setCategories((current) =>
      current.map((item) => (item.id === category.id ? { ...item, is_active: newStatus } : item)),
    );

    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: newStatus })
        .eq("id", category.id);

      if (error) throw error;

      showToast({
        title: newStatus ? "Categoria reativada" : "Categoria pausada",
        description: newStatus
          ? `${category.name} voltou a aparecer na vitrine.`
          : `${category.name} e seus produtos foram ocultados da vitrine.`,
        tone: "success",
      });
    } catch (error) {
      setCategories((current) =>
        current.map((item) =>
          item.id === category.id ? { ...item, is_active: category.is_active !== false } : item,
        ),
      );
      showToast({
        title: "Não foi possível atualizar a categoria",
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
        tone: "error",
      });
    } finally {
      setCategoryStatusUpdatingId("");
    }
  };

  const handleOpenCategoryModal = () => {'''
)

source = source.replace(
    '          order: nextOrder,\n        })',
    '          order: nextOrder,\n          is_active: true,\n        })'
)

source = source.replace(
    '''  const previewItems = useMemo(() => {
    return filteredCategories.flatMap((category) =>
      category.categoryProducts.slice(0, 2).map((product: any) => ({
        ...product,
        categoryName: category.name,
      })),
    );
  }, [filteredCategories]);

  const totalVisibleProducts = filteredCategories.reduce(
    (sum, category) => sum + category.categoryProducts.length,
    0,
  );''',
    '''  const activeFilteredCategories = useMemo(
    () => filteredCategories.filter((category) => category.is_active !== false),
    [filteredCategories],
  );

  const previewItems = useMemo(() => {
    return activeFilteredCategories.flatMap((category) =>
      category.categoryProducts
        .filter((product: any) => product.is_active)
        .slice(0, 2)
        .map((product: any) => ({
          ...product,
          categoryName: category.name,
        })),
    );
  }, [activeFilteredCategories]);

  const totalVisibleProducts = activeFilteredCategories.reduce(
    (sum, category) =>
      sum + category.categoryProducts.filter((product: any) => product.is_active).length,
    0,
  );'''
)

source = source.replace(
    '''                              <p className="break-words text-lg font-black text-gray-950">{category.name}</p>
                              <p className="text-xs font-medium text-gray-400">
                                {category.categoryProducts.length} itens
                              </p>''',
    '''                              <div className="flex flex-wrap items-center gap-2">
                                <p className="break-words text-lg font-black text-gray-950">{category.name}</p>
                                {category.is_active === false && (
                                  <span className="rounded-full bg-[#fff0e8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--brand)]">
                                    Categoria pausada
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-gray-400">
                                {category.categoryProducts.length} itens
                                {category.is_active === false ? " · oculta na vitrine" : ""}
                              </p>'''
)

source = source.replace(
    '''                        <div className="flex flex-shrink-0 items-center gap-2">
                           <button
                             onClick={() => startEditingCat(category)}''',
    '''                        <div className="flex flex-shrink-0 items-center gap-2">
                           <button
                             type="button"
                             onClick={() => void toggleCategoryStatus(category)}
                             disabled={categoryStatusUpdatingId === category.id}
                             className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                               category.is_active === false
                                 ? "border-orange-200 bg-[#fff0e8] text-[var(--brand)]"
                                 : "border-[var(--line)] bg-white text-gray-600 hover:border-orange-200"
                             }`}
                             title={category.is_active === false ? "Reativar categoria" : "Pausar categoria"}
                             aria-label={category.is_active === false ? `Reativar categoria ${category.name}` : `Pausar categoria ${category.name}`}
                           >
                             {categoryStatusUpdatingId === category.id ? (
                               <Loader2 size={15} className="animate-spin" />
                             ) : (
                               <Power size={15} />
                             )}
                             <span className="hidden sm:inline">
                               {category.is_active === false ? "Reativar" : "Pausar"}
                             </span>
                           </button>
                           <button
                             onClick={() => startEditingCat(category)}'''
)

source = source.replace(
    '{filteredCategories.slice(0, 3).map((category) => (',
    '{activeFilteredCategories.slice(0, 3).map((category) => ('
)
source = source.replace(
    '<p className="mt-1 text-sm text-white/70">{categories.length} categorias ativas</p>',
    '<p className="mt-1 text-sm text-white/70">{categories.filter((category) => category.is_active !== false).length} categorias ativas</p>'
)

menu_path.write_text(source, encoding='utf-8')

storefront_path = Path('src/features/storefront/use-storefront.ts')
storefront = storefront_path.read_text(encoding='utf-8')
storefront = storefront.replace(
    '''          .select("*")
          .eq("restaurant_id", resto.id)
          .order("order"),''',
    '''          .select("*")
          .eq("restaurant_id", resto.id)
          .eq("is_active", true)
          .order("order"),'''
)
storefront_path.write_text(storefront, encoding='utf-8')

# The public product view may already filter active products. The category filter above
# prevents paused category tabs and sections from being rendered while preserving each
# product's individual availability state.

test_path = Path('tests/category-pause.test.js')
test_path.write_text('''const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const menu = fs.readFileSync(path.join(root, "src/app/admin/(painel)/menu/page.tsx"), "utf8");
const storefront = fs.readFileSync(path.join(root, "src/features/storefront/use-storefront.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260729162500_add_category_active.sql"), "utf8");

test("categorias podem ser pausadas sem alterar o estado individual dos produtos", () => {
  assert.match(menu, /const toggleCategoryStatus = async/);
  assert.match(menu, /update\(\{ is_active: newStatus \}\)/);
  assert.match(menu, /Categoria pausada/);
  assert.match(menu, /Reativar categoria/);
  assert.doesNotMatch(menu, /from\("products"\)[\s\S]{0,120}update\(\{ is_active: newStatus \}\)/);
});

test("vitrine carrega somente categorias ativas", () => {
  assert.match(storefront, /from\("categories"\)[\s\S]{0,180}\.eq\("is_active", true\)/);
});

test("migração adiciona disponibilidade de categoria com padrão ativo", () => {
  assert.match(migration, /add column if not exists is_active boolean not null default true/);
});
''', encoding='utf-8')
