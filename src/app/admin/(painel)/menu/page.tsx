"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  Loader2,
  Plus,
  Power,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ProductModal from "@/components/product-modal";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return router.push("/admin/login");
    fetchData();
  };

  const fetchData = async () => {
    try {
      const { restaurant: resto, error } = await getCurrentRestaurant(supabase);
      if (error || !resto) return;

      setRestaurant(resto);

      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", resto.id)
        .order("order");

      if (cats) {
        setCategories(cats);
        setExpandedCategories((prev) => {
          if (Object.keys(prev).length === 0) {
            const initial: Record<string, boolean> = {};
            cats.forEach((category: any) => {
              initial[category.id] = true;
            });
            return initial;
          }
          return prev;
        });
      }

      const { data: prods } = await supabase.from("products").select("*").eq("restaurant_id", resto.id);
      if (prods) setProducts(prods);
    } catch (error) {
      console.error("Erro ao buscar cardapio:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewProduct = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  };

  const handleProductSaved = () => {
    fetchData();
    setIsProductModalOpen(false);
  };

  const toggleProductStatus = async (product: any) => {
    const newStatus = !product.is_active;
    setProducts((current) => current.map((item) => (item.id === product.id ? { ...item, is_active: newStatus } : item)));
    await supabase.from("products").update({ is_active: newStatus }).eq("id", product.id);
  };

  const handleAddCategory = async () => {
    const name = prompt("Nome da nova categoria:");
    if (!name || !restaurant) return;

    const nextOrder = categories.length > 0 ? Math.max(...categories.map((category) => category.order)) + 1 : 1;
    const { data } = await supabase
      .from("categories")
      .insert({ name, restaurant_id: restaurant.id, order: nextOrder })
      .select()
      .single();

    if (data) {
      setCategories([...categories, data]);
      setExpandedCategories((prev) => ({ ...prev, [data.id]: true }));
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Tem certeza?")) return;
    await supabase.from("categories").delete().eq("id", id);
    setCategories(categories.filter((category) => category.id !== id));
  };

  const startEditingCat = (category: any) => {
    setEditingCategoryId(category.id);
    setEditingName(category.name);
  };

  const saveCategoryName = async (id: string) => {
    if (!editingName.trim()) return;
    await supabase.from("categories").update({ name: editingName }).eq("id", id);
    setCategories(categories.map((category) => (category.id === id ? { ...category, name: editingName } : category)));
    setEditingCategoryId(null);
  };

  const handleDragStart = (index: number) => setDraggedCategoryIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === index) return;
    const newCategories = [...categories];
    const item = newCategories[draggedCategoryIndex];
    newCategories.splice(draggedCategoryIndex, 1);
    newCategories.splice(index, 0, item);
    setCategories(newCategories);
    setDraggedCategoryIndex(index);
  };

  const handleDragEnd = async () => {
    setDraggedCategoryIndex(null);
    setIsSavingCategory(true);
    const updates = categories.map((category, index) => ({ id: category.id, order: index + 1 }));
    for (const update of updates) {
      await supabase.from("categories").update({ order: update.order }).eq("id", update.id);
    }
    setIsSavingCategory(false);
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const formatPrice = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm font-semibold text-gray-500">
        <Loader2 className="mr-2 animate-spin text-[var(--brand)]" size={18} />
        Carregando cardapio...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Cardapios</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Organize categorias, destaque itens e ligue ou desligue produtos em segundos.
          </p>
          <div className="mt-3 text-sm font-medium text-gray-500">
            {isSavingCategory ? "Salvando ordem das categorias..." : `${categories.length} categorias na loja`}
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-[var(--line)] bg-white py-3 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[var(--brand)]"
            />
          </div>
          <button
            onClick={handleAddCategory}
            className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Categoria
            </span>
          </button>
          <button
            onClick={handleOpenNewProduct}
            className="brand-gradient rounded-2xl px-5 py-3 text-sm font-bold text-white"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Produto
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {categories.map((category, index) => {
          const categoryProducts = products.filter(
            (product) =>
              product.category_id === category.id &&
              product.name.toLowerCase().includes(searchTerm.toLowerCase()),
          );

          if (searchTerm && categoryProducts.length === 0) return null;

          const isExpanded = expandedCategories[category.id];
          const isEditing = editingCategoryId === category.id;

          return (
            <div
              key={category.id}
              draggable={!isEditing}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`surface-card overflow-hidden rounded-[26px] ${
                draggedCategoryIndex === index ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <button className="rounded-xl bg-[#fbf7f2] p-2 text-gray-400">
                    <GripVertical size={18} />
                  </button>

                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="rounded-xl border border-[var(--brand)] px-3 py-2 text-sm font-bold outline-none"
                      />
                      <button onClick={() => saveCategoryName(category.id)} className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                        <Save size={15} />
                      </button>
                      <button onClick={() => setEditingCategoryId(null)} className="rounded-xl bg-gray-100 p-2 text-gray-600">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => toggleCategory(category.id)} className="flex min-w-0 items-center gap-3 text-left">
                      <div>
                        <p className="text-lg font-black text-gray-950">{category.name}</p>
                        <p className="text-xs font-medium text-gray-400">{categoryProducts.length} itens</p>
                      </div>
                    </button>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditingCat(category)} className="rounded-xl p-2 text-gray-400 hover:bg-[#fbf7f2] hover:text-[var(--brand)]">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDeleteCategory(category.id)} className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]">
                      <Trash2 size={16} />
                    </button>
                    <button onClick={() => toggleCategory(category.id)} className="rounded-xl p-2 text-gray-400 hover:bg-[#fbf7f2]">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="divide-y divide-[var(--line)] bg-[#fffdfa]">
                  {categoryProducts.length > 0 ? (
                    categoryProducts.map((product) => (
                      <div key={product.id} className="group flex items-center gap-4 px-5 py-4">
                        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[#fbf7f2]">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-gray-300">
                              FOTO
                            </div>
                          )}
                          {!product.is_active && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                              <Power size={16} className="text-gray-500" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-bold text-gray-950">{product.name}</p>
                            {!product.is_active && (
                              <span className="rounded-full bg-[#fff0e8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--brand)]">
                                Pausado
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm text-gray-500">{product.description}</p>
                          <p className="mt-2 text-sm font-black text-gray-950">{formatPrice(product.price)}</p>
                        </div>

                        <div className="flex items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-600"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleProductStatus(product)}
                            className={`rounded-xl p-2 ${
                              product.is_active
                                ? "bg-[#fbf7f2] text-gray-500"
                                : "bg-[#fff0e8] text-[var(--brand)]"
                            }`}
                            title={product.is_active ? "Pausar vendas" : "Ativar vendas"}
                          >
                            <Power size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm font-medium text-gray-500">Categoria vazia</p>
                      <button
                        onClick={handleOpenNewProduct}
                        className="mt-3 rounded-xl bg-[var(--brand-soft)] px-4 py-2 text-xs font-bold text-[var(--brand)]"
                      >
                        Adicionar produto
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onProductSaved={handleProductSaved}
        restaurantId={restaurant?.id}
        categories={categories}
        productToEdit={editingProduct}
      />
    </div>
  );
}
