"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  Import,
  Link2,
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
import { useToast } from "@/components/ui/toast-provider";

type SortKey = "name" | "price";
type SortDirection = "asc" | "desc";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryModalError, setCategoryModalError] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [ifoodMenuUrl, setIfoodMenuUrl] = useState("");
  const [importError, setImportError] = useState("");
  const [isImportingMenu, setIsImportingMenu] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [deleteCategoryError, setDeleteCategoryError] = useState("");
  const [categoryStatusUpdatingId, setCategoryStatusUpdatingId] = useState("");

  const router = useRouter();
  const { showToast } = useToast();
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

      const { data: prods } = await supabase
        .from("products")
        .select("*")
        .eq("restaurant_id", resto.id);

      if (prods) setProducts(prods);
    } catch (error) {
      console.error("Erro ao buscar cardápio:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNewProduct = () => {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  };

  const handleOpenImportModal = () => {
    setIfoodMenuUrl("");
    setImportError("");
    setIsImportModalOpen(true);
  };

  const handleImportIfoodMenu = async () => {
    if (!restaurant?.id || isImportingMenu) return;

    const publicUrl = ifoodMenuUrl.trim();

    try {
      const parsedUrl = new URL(publicUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      const isIfoodHost = hostname === "ifood.com.br" || hostname.endsWith(".ifood.com.br");

      if (
        parsedUrl.protocol !== "https:" ||
        !isIfoodHost ||
        !parsedUrl.pathname.toLowerCase().includes("/delivery/")
      ) {
        throw new Error("Cole o link público da loja no iFood.");
      }
    } catch {
      setImportError("Cole um link público válido de uma loja no iFood.");
      return;
    }

    setIsImportingMenu(true);
    setImportError("");

    try {
      const response = await fetch("/api/integrations/ifood/public-link/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          publicUrl,
          importStoreProfile: false,
        }),
      });
      const responseText = await response.text();
      let result: Record<string, any> = {};

      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch {
        result = {};
      }

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível importar esse cardápio agora.");
      }

      await fetchData();
      setIsImportModalOpen(false);
      setIfoodMenuUrl("");
      showToast({
        title: "Cardápio importado",
        description: `${result.summary?.categoriesProcessed || 0} categorias, ${result.summary?.productsProcessed || 0} produtos, ${result.summary?.addonGroupsProcessed || 0} grupos e ${result.summary?.addonOptionsProcessed || 0} complementos foram processados. Revise os itens antes de publicar.`,
        tone: "success",
      });
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Não foi possível importar esse cardápio agora.",
      );
    } finally {
      setIsImportingMenu(false);
    }
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
    setProducts((current) =>
      current.map((item) => (item.id === product.id ? { ...item, is_active: newStatus } : item)),
    );
    await supabase.from("products").update({ is_active: newStatus }).eq("id", product.id);
  };

  const toggleCategoryStatus = async (category: any) => {
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

  const handleOpenCategoryModal = () => {
    setNewCategoryName("");
    setCategoryModalError("");
    setIsCategoryModalOpen(true);
  };

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();

    if (!restaurant) return;

    if (!trimmedName) {
      setCategoryModalError("Digite um nome para a categoria.");
      return;
    }

    const alreadyExists = categories.some(
      (category) => category.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (alreadyExists) {
      setCategoryModalError("Já existe uma categoria com esse nome.");
      return;
    }

    setIsCreatingCategory(true);
    setCategoryModalError("");

    try {
      const nextOrder =
        categories.length > 0
          ? Math.max(...categories.map((category) => Number(category.order) || 0)) + 1
          : 1;

      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: trimmedName,
          restaurant_id: restaurant.id,
          order: nextOrder,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setCategories((current) => [...current, data]);
        setExpandedCategories((prev) => ({ ...prev, [data.id]: true }));
        setIsCategoryModalOpen(false);
        setNewCategoryName("");
        showToast({
          title: "Categoria criada",
          description: `${trimmedName} já está pronta para receber produtos.`,
          tone: "success",
        });
      }
    } catch (error) {
      console.error("Erro ao criar categoria:", error);
      setCategoryModalError("Não foi possível criar a categoria agora.");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleOpenDeleteCategory = (category: any) => {
    setDeleteCategoryError("");
    setCategoryToDelete(category);
  };

  const handleCloseDeleteCategory = () => {
    if (isDeletingCategory) return;
    setDeleteCategoryError("");
    setCategoryToDelete(null);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete?.id || isDeletingCategory) return;

    setIsDeletingCategory(true);
    setDeleteCategoryError("");

    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryToDelete.id);

      if (error) throw error;

      setCategories((current) =>
        current.filter((category) => category.id !== categoryToDelete.id),
      );
      setProducts((current) =>
        current.filter((product) => product.category_id !== categoryToDelete.id),
      );
      showToast({
        title: "Categoria excluída",
        description: `${categoryToDelete.name} foi removida do cardápio.`,
        tone: "success",
      });
      setCategoryToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir categoria:", error);
      setDeleteCategoryError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a categoria agora.",
      );
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const startEditingCat = (category: any) => {
    setEditingCategoryId(category.id);
    setEditingName(category.name);
  };

  const saveCategoryName = async (id: string) => {
    if (!editingName.trim()) return;

    await supabase.from("categories").update({ name: editingName.trim() }).eq("id", id);
    setCategories(
      categories.map((category) =>
        category.id === id ? { ...category, name: editingName.trim() } : category,
      ),
    );
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

  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return categories
      .map((category) => {
        const categoryProducts = products.filter((product) => {
          if (product.category_id !== category.id) return false;

          if (!term) return true;

          const haystack = [product.name, product.description, category.name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(term);
        });

        const sortedProducts = [...categoryProducts].sort((a, b) => {
          if (sortBy === "price") {
            return sortDirection === "asc" ? a.price - b.price : b.price - a.price;
          }

          return sortDirection === "asc"
            ? a.name.localeCompare(b.name, "pt-BR")
            : b.name.localeCompare(a.name, "pt-BR");
        });

        return {
          ...category,
          categoryProducts: sortedProducts,
        };
      })
      .filter((category) => !searchTerm || category.categoryProducts.length > 0);
  }, [categories, products, searchTerm, sortBy, sortDirection]);

  const activeFilteredCategories = useMemo(
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
  );

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-7.5rem)] items-center justify-center" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Loader2 className="animate-spin text-[var(--brand)]" size={18} />
          Carregando cardápio...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl pb-20">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-950">Cardápios</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Organize categorias, destaque itens e ligue ou desligue produtos em segundos.
          </p>
          <div className="mt-3 text-sm font-medium text-gray-500">
            {isSavingCategory
              ? "Salvando ordem das categorias..."
              : `${categories.length} categorias e ${products.length} produtos na loja`}
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative w-full min-w-0 sm:min-w-[240px] lg:w-[280px]">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar item ou categoria"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12 w-full rounded-2xl border border-[var(--line)] bg-white pl-11 pr-4 text-sm outline-none transition-colors focus:border-[var(--brand)]"
            />
          </div>

          <button
            onClick={handleOpenImportModal}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700"
          >
            <span className="inline-flex items-center gap-2">
              <Import size={16} />
              Importar do iFood
            </span>
          </button>

          <button
            onClick={handleOpenCategoryModal}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 text-sm font-bold text-gray-700"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Categoria
            </span>
          </button>

          <button
            onClick={handleOpenNewProduct}
            className="brand-gradient inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-bold text-white"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Produto
            </span>
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0 space-y-5">
          <div className="surface-card rounded-[26px] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  Organização do cardápio
                </p>
                <h2 className="mt-1 text-xl font-black text-gray-950">
                  Ordene e visualize como os itens vão aparecer.
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setSortBy("name");
                    setSortDirection((current) =>
                      sortBy === "name" && current === "asc" ? "desc" : "asc",
                    );
                  }}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                    sortBy === "name"
                      ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "border border-[var(--line)] bg-white text-gray-600"
                  }`}
                >
                  {sortDirection === "asc" && sortBy === "name" ? (
                    <ArrowDownAZ size={16} />
                  ) : (
                    <ArrowUpAZ size={16} />
                  )}
                  Ordem alfabética
                </button>
                <button
                  onClick={() => {
                    setSortBy("price");
                    setSortDirection((current) =>
                      sortBy === "price" && current === "asc" ? "desc" : "asc",
                    );
                  }}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold ${
                    sortBy === "price"
                      ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "border border-[var(--line)] bg-white text-gray-600"
                  }`}
                >
                  {sortDirection === "asc" && sortBy === "price" ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                  Valor
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            {filteredCategories.length === 0 ? (
              <div className="surface-card flex min-h-[420px] flex-col items-center justify-center rounded-[26px] px-6 text-center">
                <p className="text-lg font-black text-gray-950">Nada encontrado</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                  Não encontramos itens ou categorias com esse termo. Tente outra busca ou limpe o campo.
                </p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="mt-4 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold text-gray-700"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              filteredCategories.map((category, index) => {
                const isExpanded = expandedCategories[category.id];
                const isEditing = editingCategoryId === category.id;

                return (
                  <div
                    key={category.id}
                    draggable={!isEditing}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`surface-card w-full min-w-0 overflow-hidden rounded-[26px] ${
                      draggedCategoryIndex === index ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[var(--line)] bg-white px-5 py-4">
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
                            <button
                              onClick={() => saveCategoryName(category.id)}
                              className="rounded-xl bg-emerald-100 p-2 text-emerald-700"
                            >
                              <Save size={15} />
                            </button>
                            <button
                              onClick={() => setEditingCategoryId(null)}
                              className="rounded-xl bg-gray-100 p-2 text-gray-600"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
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
                              </p>
                            </div>
                          </button>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <button
                            onClick={() => startEditingCat(category)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-[#fbf7f2] hover:text-[var(--brand)]"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteCategory(category)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-[#fbf7f2]"
                          >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="divide-y divide-[var(--line)] bg-[#fffdfa]">
                        {category.categoryProducts.length > 0 ? (
                          category.categoryProducts.map((product: any) => (
                            <div key={product.id} className="group flex min-w-0 flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap">
                              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[#fbf7f2]">
                                {product.image_url ? (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                  />
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
                                <p className="mt-1 truncate text-sm text-gray-500">
                                  {product.description}
                                </p>
                                <p className="mt-2 text-sm font-black text-gray-950">
                                  {formatPrice(product.price)}
                                </p>
                              </div>

                              <div className="ml-20 flex flex-shrink-0 items-center gap-2 opacity-100 transition-opacity sm:ml-0 md:opacity-0 md:group-hover:opacity-100">
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
              })
            )}
          </div>
        </div>

        <aside className="surface-card min-w-0 h-fit rounded-[26px] p-5 2xl:sticky 2xl:top-28">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            Pré-visualização
          </p>
          <h2 className="mt-2 text-xl font-black text-gray-950">Como o cardápio está ficando</h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Uma leitura rápida da vitrine com base nas categorias e produtos visíveis agora.
          </p>

          <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_16px_36px_rgba(17,16,15,0.08)]">
            <div className="bg-[#171311] px-4 py-5 text-white">
              <p className="text-lg font-black">{restaurant?.name || "Sua loja"}</p>
              <p className="mt-1 text-sm text-white/70">{categories.filter((category) => category.is_active !== false).length} categorias ativas</p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {activeFilteredCategories.slice(0, 3).map((category) => (
                  <span
                    key={category.id}
                    className="max-w-full break-words rounded-full bg-[#fff0e8] px-3 py-1.5 text-xs font-bold text-[var(--brand)]"
                  >
                    {category.name}
                  </span>
                ))}
              </div>

              {previewItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-gray-500">
                  Nenhum item visível para pré-visualizar.
                </div>
              ) : (
                <div className="space-y-3">
                  {previewItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                        {item.categoryName}
                      </p>
                      <p className="mt-2 font-bold text-gray-950">{item.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                        {item.description || "Sem descrição cadastrada."}
                      </p>
                      <p className="mt-3 text-sm font-black text-gray-950">
                        {formatPrice(item.price)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm text-gray-600">
                <span className="font-bold text-gray-950">{totalVisibleProducts}</span> produto(s)
                visíveis neste filtro.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onProductSaved={handleProductSaved}
        restaurantId={restaurant?.id}
        categories={categories}
        productToEdit={editingProduct}
      />

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ifood-import-title"
            className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_30px_80px_rgba(17,16,15,0.18)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-white px-6 py-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <Link2 size={20} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-600">
                    Importação por link
                  </p>
                  <h2 id="ifood-import-title" className="mt-1 text-xl font-black text-gray-950">
                    Importar cardápio do iFood
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    Cole o link público da loja. O nome, o endereço e a identidade visual da sua
                    loja não serão alterados.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImportingMenu}
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 disabled:opacity-50"
                aria-label="Fechar importação"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-2">
                <span className="text-sm font-bold text-gray-700">Link público da loja</span>
                <input
                  autoFocus
                  type="url"
                  inputMode="url"
                  value={ifoodMenuUrl}
                  onChange={(event) => {
                    setIfoodMenuUrl(event.target.value);
                    if (importError) setImportError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleImportIfoodMenu();
                    }
                  }}
                  placeholder="https://www.ifood.com.br/delivery/..."
                  aria-invalid={Boolean(importError)}
                  aria-describedby={importError ? "ifood-import-error" : "ifood-import-help"}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--brand)]"
                />
              </label>

              <p id="ifood-import-help" className="text-sm leading-6 text-gray-500">
                Categorias e produtos importados anteriormente serão atualizados. Itens criados
                manualmente continuarão no seu cardápio. Alguns complementos podem precisar de
                ajustes após a importação.
              </p>

              {importError && (
                <div
                  id="ifood-import-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                >
                  <AlertCircle size={17} className="mt-0.5 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImportingMenu}
                className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportIfoodMenu}
                disabled={isImportingMenu || !ifoodMenuUrl.trim()}
                className="brand-gradient rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  {isImportingMenu ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Import size={16} />
                  )}
                  {isImportingMenu ? "Importando cardápio..." : "Importar cardápio"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {categoryToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleCloseDeleteCategory();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-category-title"
            aria-describedby="delete-category-description"
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-red-100 bg-[#fffdfa] shadow-[0_30px_90px_rgba(17,16,15,0.24)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-red-100 bg-white px-6 py-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <Trash2 size={21} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-600">
                    Ação permanente
                  </p>
                  <h2 id="delete-category-title" className="mt-1 text-2xl font-black tracking-tight text-gray-950">
                    Excluir categoria?
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDeleteCategory}
                disabled={isDeletingCategory}
                aria-label="Fechar confirmação de exclusão"
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 transition-colors hover:bg-[#f1ebe3] disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p id="delete-category-description" className="text-sm leading-6 text-gray-600">
                A categoria <strong className="font-bold text-gray-950">“{categoryToDelete.name}”</strong> será removida permanentemente. Esta ação não pode ser desfeita.
              </p>

              {Number(categoryToDelete.categoryProducts?.length || 0) > 0 && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                  <AlertCircle size={17} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Esta categoria possui {categoryToDelete.categoryProducts.length} produto(s) vinculado(s).
                  </span>
                </div>
              )}

              {deleteCategoryError && (
                <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  <AlertCircle size={17} className="mt-0.5 flex-shrink-0" />
                  <span>{deleteCategoryError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseDeleteCategory}
                disabled={isDeletingCategory}
                className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-[#fbf7f2] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                disabled={isDeletingCategory}
                className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  {isDeletingCategory ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {isDeletingCategory ? "Excluindo..." : "Excluir categoria"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_30px_80px_rgba(17,16,15,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] bg-white px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  Nova categoria
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-gray-950">
                  Organize seu cardápio
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Crie um grupo para reunir produtos parecidos, como hambúrgueres, bebidas ou
                  combos.
                </p>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 transition-colors hover:bg-[#f1ebe3] hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <label className="block space-y-2">
                <span className="text-sm font-bold text-gray-700">Nome da categoria</span>
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    if (categoryModalError) setCategoryModalError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!isCreatingCategory) handleCreateCategory();
                    }
                  }}
                  placeholder="Ex.: Hambúrgueres artesanais"
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--brand)]"
                />
              </label>

              {categoryModalError && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{categoryModalError}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={isCreatingCategory}
                className="brand-gradient rounded-2xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  {isCreatingCategory && <Loader2 size={16} className="animate-spin" />}
                  Criar categoria
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
