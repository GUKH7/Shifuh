"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Copy,
  GripVertical,
  Info,
  Link2,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Scissors,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Cropper from "react-easy-crop";

interface AddonOption {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface AddonGroup {
  id: string;
  title: string;
  required: boolean;
  min_options: number;
  max_options: number;
  is_active: boolean;
  options: AddonOption[];
  linked_product_count?: number;
  persisted?: boolean;
  product_links?: Array<{ product_id: string; sort_order: number }>;
}

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductSaved: () => void;
  restaurantId: string;
  categories: { id: string; name: string }[];
  productToEdit?: any;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9),
  );
}

function getMenuImageStoragePath(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = "/storage/v1/object/public/menu-images/";
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const encodedPath = url.pathname.slice(markerIndex + marker.length);
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch {
    return null;
  }
}

function normalizeAddonOption(option: any): AddonOption {
  return {
    id: typeof option?.id === "string" && option.id ? option.id : crypto.randomUUID(),
    name: typeof option?.name === "string" ? option.name : "",
    price: Number(option?.price) || 0,
    is_active: option?.is_active !== false,
  };
}

function normalizeAddonGroup(
  group: any,
  linkedProductCount = 0,
  persisted = false,
): AddonGroup {
  const required = Boolean(group?.required);

  return {
    id: typeof group?.id === "string" && group.id ? group.id : crypto.randomUUID(),
    title: typeof group?.title === "string" ? group.title : "",
    required,
    min_options: Math.max(
      0,
      Number(group?.min_options ?? (required ? 1 : 0)) || 0,
    ),
    max_options: Math.max(0, Number(group?.max_options) || 0),
    is_active: group?.is_active !== false,
    options: Array.isArray(group?.options)
      ? group.options.map(normalizeAddonOption)
      : [],
    linked_product_count: linkedProductCount,
    persisted,
    product_links: Array.isArray(group?.product_addon_group_links)
      ? group.product_addon_group_links
      : Array.isArray(group?.product_links)
        ? group.product_links
        : [],
  };
}

function cloneAddonGroup(group: AddonGroup): AddonGroup {
  return {
    ...group,
    id: crypto.randomUUID(),
    options: group.options.map((option) => ({
      ...option,
      id: crypto.randomUUID(),
    })),
    linked_product_count: 0,
    persisted: false,
    product_links: [],
  };
}

function buildEffectiveAddonCache(groups: AddonGroup[]) {
  return groups
    .filter((group) => group.is_active !== false && group.title.trim())
    .map((group) => ({
      id: group.id,
      title: group.title.trim(),
      required: group.required,
      min_options: group.required
        ? Math.max(1, Number(group.min_options) || 1)
        : Math.max(0, Number(group.min_options) || 0),
      max_options: Math.max(0, Number(group.max_options) || 0),
      options: group.options
        .filter((option) => option.is_active !== false && option.name.trim())
        .map((option) => ({
          id: option.id,
          name: option.name.trim(),
          price: Math.max(0, Number(option.price) || 0),
        })),
    }))
    .filter((group) => group.options.length > 0);
}

export default function ProductModal({
  isOpen,
  onClose,
  onProductSaved,
  restaurantId,
  categories,
  productToEdit,
}: ProductModalProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isPromotional, setIsPromotional] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [addonLibrary, setAddonLibrary] = useState<AddonGroup[]>([]);
  const [isAddonLibraryOpen, setIsAddonLibraryOpen] = useState(false);
  const [isAddonLibraryLoading, setIsAddonLibraryLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedImageBlob, setCroppedImageBlob] = useState<Blob | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!croppedImageBlob) {
      setCroppedPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(croppedImageBlob);
    setCroppedPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [croppedImageBlob]);

  useEffect(() => {
    if (!isOpen) return;

    setCroppedImageBlob(null);
    setImageSrc(null);
    setCroppedAreaPixels(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsCropping(false);
    setIsDeleteConfirmOpen(false);
    setIsDeleting(false);
    setDeleteError("");
    setIsAddonLibraryOpen(false);

    if (productToEdit) {
      setName(productToEdit.name);
      setDescription(productToEdit.description || "");
      setPrice(productToEdit.price.toString());
      setCategoryId(productToEdit.category_id);
      setImageUrl(productToEdit.image_url || null);
      setIsPromotional(Boolean(productToEdit.is_promotional));
      setIsVegetarian(Boolean(productToEdit.is_vegetarian));

      if (productToEdit.addons && Array.isArray(productToEdit.addons)) {
        if (productToEdit.addons.length > 0 && productToEdit.addons[0].title) {
          setAddonGroups(
            productToEdit.addons.map((group: any) => normalizeAddonGroup(group)),
          );
        } else if (productToEdit.addons.length > 0) {
          setAddonGroups([
            normalizeAddonGroup({
              id: crypto.randomUUID(),
              title: "Adicionais",
              required: false,
              min_options: 0,
              max_options: 0,
              is_active: true,
              options: productToEdit.addons,
            }),
          ]);
        } else {
          setAddonGroups([]);
        }
      } else {
        setAddonGroups([]);
      }
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setAddonGroups([]);
      setImageUrl(null);
      setIsPromotional(false);
      setIsVegetarian(false);
      setCategoryId(categories[0]?.id || "");
    }
  }, [isOpen, productToEdit, categories]);

  useEffect(() => {
    if (!isOpen || !restaurantId) return;

    let active = true;

    const loadAddonLibrary = async () => {
      setIsAddonLibraryLoading(true);

      try {
        const { data, error } = await supabase
          .from("addon_groups")
          .select(
            "id, restaurant_id, title, required, min_options, max_options, is_active, options, product_addon_group_links(product_id, sort_order)",
          )
          .eq("restaurant_id", restaurantId)
          .order("title");

        if (error) throw error;
        if (!active) return;

        const libraryGroups = (data || []).map((row: any) =>
          normalizeAddonGroup(
            row,
            Array.isArray(row.product_addon_group_links)
              ? row.product_addon_group_links.length
              : 0,
            true,
          ),
        );

        setAddonLibrary(libraryGroups);

        if (productToEdit?.id) {
          const linkedGroups = libraryGroups
            .filter((group) =>
              group.product_links?.some(
                (link) => link.product_id === productToEdit.id,
              ),
            )
            .sort((a, b) => {
              const aOrder =
                a.product_links?.find(
                  (link) => link.product_id === productToEdit.id,
                )?.sort_order || 0;
              const bOrder =
                b.product_links?.find(
                  (link) => link.product_id === productToEdit.id,
                )?.sort_order || 0;
              return aOrder - bOrder;
            });

          if (linkedGroups.length > 0) {
            setAddonGroups(linkedGroups);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar biblioteca de complementos:", error);
      } finally {
        if (active) setIsAddonLibraryLoading(false);
      }
    };

    void loadAddonLibrary();

    return () => {
      active = false;
    };
    // O cliente Supabase é recriado no render; os gatilhos reais são a loja/produto/modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, restaurantId, productToEdit?.id]);

  const addGroup = () => {
    setAddonGroups((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "",
        required: false,
        min_options: 0,
        max_options: 0,
        is_active: true,
        options: [
          {
            id: crypto.randomUUID(),
            name: "",
            price: 0,
            is_active: true,
          },
        ],
        linked_product_count: 0,
        persisted: false,
        product_links: [],
      },
    ]);
  };

  const removeGroup = (index: number) => {
    setAddonGroups((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const linkLibraryGroup = (group: AddonGroup) => {
    setAddonGroups((current) => {
      if (current.some((item) => item.id === group.id)) return current;
      return [...current, { ...group, persisted: true }];
    });
  };

  const copyLibraryGroup = (group: AddonGroup) => {
    setAddonGroups((current) => [...current, cloneAddonGroup(group)]);
  };

  const isGroupAttached = (groupId: string) =>
    addonGroups.some((group) => group.id === groupId);

  const updateGroup = (index: number, field: keyof AddonGroup, value: any) => {
    setAddonGroups((current) =>
      current.map((group, currentIndex) =>
        currentIndex === index ? { ...group, [field]: value } : group,
      ),
    );
  };

  const addOptionToGroup = (groupIndex: number) => {
    setAddonGroups((current) =>
      current.map((group, currentIndex) =>
        currentIndex === groupIndex
          ? {
              ...group,
              options: [
                ...group.options,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  price: 0,
                  is_active: true,
                },
              ],
            }
          : group,
      ),
    );
  };

  const removeOptionFromGroup = (groupIndex: number, optionIndex: number) => {
    setAddonGroups((current) =>
      current.map((group, currentIndex) =>
        currentIndex === groupIndex
          ? {
              ...group,
              options: group.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex),
            }
          : group,
      ),
    );
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    field: "name" | "price",
    value: string,
  ) => {
    setAddonGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) return group;

        return {
          ...group,
          options: group.options.map((option, currentOptionIndex) => {
            if (currentOptionIndex !== optionIndex) return option;
            return {
              ...option,
              [field]: field === "price" ? parseFloat(value) || 0 : value,
            };
          }),
        };
      }),
    );
  };

  const toggleOptionActive = (groupIndex: number, optionIndex: number) => {
    setAddonGroups((current) =>
      current.map((group, currentGroupIndex) => {
        if (currentGroupIndex !== groupIndex) return group;

        return {
          ...group,
          options: group.options.map((option, currentOptionIndex) =>
            currentOptionIndex === optionIndex
              ? { ...option, is_active: option.is_active === false }
              : option,
          ),
        };
      }),
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageSrc(reader.result as string);
      setIsCropping(true);
    });
    reader.readAsDataURL(file);

    // Permite escolher novamente o mesmo arquivo após remover/cancelar um recorte.
    e.target.value = "";
  };

  const showCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    setCroppedImageBlob(blob);
    setIsCropping(false);
  };

  const handleRemoveImage = () => {
    setImageUrl(null);
    setCroppedImageBlob(null);
    setImageSrc(null);
    setCroppedAreaPixels(null);
    setIsCropping(false);
  };

  const handleOpenDeleteConfirm = () => {
    if (!productToEdit) return;
    setDeleteError("");
    setIsDeleteConfirmOpen(true);
  };

  const handleCloseDeleteConfirm = () => {
    if (isDeleting) return;
    setDeleteError("");
    setIsDeleteConfirmOpen(false);
  };

  const handleDeleteProduct = async () => {
    if (!productToEdit?.id || !restaurantId || isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToEdit.id)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;

      const storagePath = getMenuImageStoragePath(productToEdit.image_url);
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from("menu-images")
          .remove([storagePath]);

        if (storageError) {
          console.warn("Produto excluído, mas não foi possível limpar a imagem do storage:", storageError);
        }
      }

      setIsDeleteConfirmOpen(false);
      onProductSaved();
      onClose();
    } catch (error) {
      console.error("Erro ao excluir produto:", error);

      const rawMessage =
        typeof (error as { message?: unknown } | null)?.message === "string"
          ? (error as { message: string }).message
          : "Não foi possível excluir o produto agora.";
      const errorCode =
        typeof (error as { code?: unknown } | null)?.code === "string"
          ? (error as { code: string }).code
          : "";
      const normalizedMessage = rawMessage.toLowerCase();
      const hasProtectedDependency =
        errorCode === "23503" ||
        normalizedMessage.includes("foreign key") ||
        normalizedMessage.includes("reward") ||
        normalizedMessage.includes("promotion") ||
        normalizedMessage.includes("prize");

      setDeleteError(
        hasProtectedDependency
          ? "Este produto está vinculado a uma promoção, prêmio ou recompensa. Remova esse vínculo antes de excluir o produto."
          : rawMessage,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !categoryId) return alert("Categoria obrigatória!");
    setIsLoading(true);

    let uploadedPath: string | null = null;

    try {
      let finalUrl = imageUrl;

      if (croppedImageBlob) {
        const fileName = `${restaurantId}/${Date.now()}-prod.jpg`;
        const { error: upErr } = await supabase.storage
          .from("menu-images")
          .upload(fileName, croppedImageBlob);
        if (upErr) throw upErr;

        uploadedPath = fileName;
        const { data } = supabase.storage.from("menu-images").getPublicUrl(fileName);
        finalUrl = data.publicUrl;
      }

      const cleanGroups = addonGroups
        .filter((group) => group.title.trim() !== "")
        .map((group) => ({
          id: group.id,
          title: group.title.trim(),
          required: group.required,
          min_options: group.required
            ? Math.max(1, Number(group.min_options) || 1)
            : Math.max(0, Number(group.min_options) || 0),
          max_options: Math.max(0, Number(group.max_options) || 0),
          is_active: group.is_active !== false,
          options: group.options
            .filter((option) => option.name.trim() !== "")
            .map((option) => ({
              id: option.id,
              name: option.name.trim(),
              price: Math.max(0, Number(option.price) || 0),
              is_active: option.is_active !== false,
            })),
        }));

      const payload = {
        restaurant_id: restaurantId,
        category_id: categoryId,
        name,
        description,
        price: parseFloat(price.replace(",", ".")),
        image_url: finalUrl,
        addons: buildEffectiveAddonCache(cleanGroups),
        is_promotional: isPromotional,
        is_vegetarian: isVegetarian,
      };

      let error;
      let savedProductId = productToEdit?.id as string | undefined;
      let createdProductId: string | null = null;

      if (productToEdit) {
        const { error: updateErr } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productToEdit.id);
        error = updateErr;
      } else {
        const { data: insertedProduct, error: insertErr } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        error = insertErr;
        savedProductId = insertedProduct?.id;
        createdProductId = insertedProduct?.id || null;
      }

      if (error || !savedProductId) {
        if (uploadedPath) {
          await supabase.storage.from("menu-images").remove([uploadedPath]);
        }
        throw error || new Error("Não foi possível identificar o produto salvo.");
      }

      const { error: addonConfigurationError } = await supabase.rpc(
        "save_product_addon_configuration",
        {
          p_product_id: savedProductId,
          p_groups: cleanGroups,
        },
      );

      if (addonConfigurationError) {
        if (createdProductId) {
          await supabase
            .from("products")
            .delete()
            .eq("id", createdProductId)
            .eq("restaurant_id", restaurantId);
        }
        if (uploadedPath) {
          await supabase.storage.from("menu-images").remove([uploadedPath]);
        }
        throw addonConfigurationError;
      }

      const previousImageUrl = productToEdit?.image_url as string | null | undefined;
      if (previousImageUrl && previousImageUrl !== finalUrl) {
        const previousStoragePath = getMenuImageStoragePath(previousImageUrl);
        if (previousStoragePath) {
          const { error: removeError } = await supabase.storage
            .from("menu-images")
            .remove([previousStoragePath]);

          if (removeError) {
            console.warn("Produto salvo, mas não foi possível limpar a imagem antiga:", removeError);
          }
        }
      }

      onProductSaved();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  if (isCropping) {
    return (
      <div className="fixed inset-0 z-[60] flex h-screen flex-col bg-black">
        <div className="flex justify-between bg-[#11100f] p-4 text-white">
          <span>Ajustar foto</span>
          <button type="button" onClick={() => setIsCropping(false)} aria-label="Fechar recorte">
            <X />
          </button>
        </div>
        <div className="relative flex-1 bg-gray-800">
          <Cropper
            image={imageSrc || ""}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>
        <div className="bg-white p-4">
          <button
            type="button"
            onClick={showCroppedImage}
            className="brand-gradient w-full rounded-2xl py-3 font-bold text-white"
          >
            Confirmar recorte
          </button>
        </div>
      </div>
    );
  }

  const hasImage = Boolean(croppedPreviewUrl || imageUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-[#fffdfa] shadow-[0_30px_80px_rgba(17,16,15,0.18)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-gray-950">
              {productToEdit ? "Editar produto" : "Novo produto"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Preencha os dados principais e configure complementos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading || isDeleting}
            aria-label="Fechar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 transition-colors hover:bg-[#f1ebe3] hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid gap-6 md:grid-cols-[140px_1fr]">
            <div className="group relative flex h-[140px] w-full items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-[var(--line)] bg-white">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                aria-label={hasImage ? "Alterar imagem do produto" : "Adicionar imagem do produto"}
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
              />

              {croppedPreviewUrl ? (
                <img
                  src={croppedPreviewUrl}
                  alt="Prévia da imagem do produto"
                  className="h-full w-full object-cover"
                />
              ) : imageUrl ? (
                <img src={imageUrl} alt="Imagem do produto" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center text-xs font-medium text-gray-500">
                  <Upload className="mx-auto mb-2 text-gray-400" size={22} />
                  Adicionar foto
                </div>
              )}

              {hasImage && (
                <>
                  <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/45 text-xs font-bold text-white group-hover:flex">
                    Alterar
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    aria-label="Remover imagem do produto"
                    title="Remover imagem"
                    className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/95 text-red-600 shadow-sm transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>

            <div className="space-y-4">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm font-bold outline-none focus:border-[var(--brand)]"
                placeholder="Nome do produto"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none focus:border-[var(--brand)]"
                rows={3}
                placeholder="Descrição curta do item"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  required
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm font-bold outline-none focus:border-[var(--brand)]"
                  placeholder="Preço"
                />
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm font-medium outline-none focus:border-[var(--brand)]"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={isPromotional}
                    onChange={(event) => setIsPromotional(event.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  Produto em promoção
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={isVegetarian}
                    onChange={(event) => setIsVegetarian(event.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Vegetariano
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-[var(--line)] bg-[#fcfaf7] p-5">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-gray-700">
                  <Scissors size={16} className="text-[var(--brand)]" />
                  Complementos
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Crie, copie ou vincule grupos reutilizáveis entre produtos.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddonLibraryOpen((current) => !current)}
                  className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2 text-xs font-bold text-gray-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <Link2 size={14} />
                    Usar existente
                  </span>
                </button>
                <button
                  type="button"
                  onClick={addGroup}
                  className="rounded-2xl border border-[var(--line)] bg-white px-4 py-2 text-xs font-bold text-gray-700"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus size={14} />
                    Novo grupo
                  </span>
                </button>
              </div>
            </div>

            {isAddonLibraryOpen && (
              <div className="mb-5 rounded-2xl border border-[var(--line)] bg-white p-4">
                <div className="mb-3">
                  <p className="text-sm font-black text-gray-900">Biblioteca de grupos</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Vincular mantém o mesmo grupo entre produtos. Copiar cria uma versão independente.
                  </p>
                </div>

                {isAddonLibraryLoading ? (
                  <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-4 text-sm text-gray-500">
                    <Loader2 size={16} className="animate-spin" />
                    Carregando grupos...
                  </div>
                ) : addonLibrary.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] px-3 py-5 text-center text-sm text-gray-500">
                    Ainda não há grupos salvos nesta loja.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {addonLibrary.map((libraryGroup) => {
                      const attached = isGroupAttached(libraryGroup.id);

                      return (
                        <div
                          key={libraryGroup.id}
                          className="flex flex-col gap-3 rounded-xl border border-[var(--line)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-gray-900">
                                {libraryGroup.title}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                                  libraryGroup.is_active === false
                                    ? "bg-gray-100 text-gray-500"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {libraryGroup.is_active === false ? "Pausado" : "Ativo"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {libraryGroup.options.length} opções · vinculado a{" "}
                              {libraryGroup.linked_product_count || 0} produto(s)
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => copyLibraryGroup(libraryGroup)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-bold text-gray-700"
                            >
                              <Copy size={13} />
                              Copiar
                            </button>
                            <button
                              type="button"
                              disabled={attached}
                              onClick={() => linkLibraryGroup(libraryGroup)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-xs font-bold text-[var(--brand)] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                            >
                              <Link2 size={13} />
                              {attached ? "Vinculado" : "Vincular"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {addonGroups.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-8 text-center text-sm text-gray-500">
                Nenhum complemento adicionado.
              </div>
            )}

            <div className="space-y-4">
              {addonGroups.map((group, groupIndex) => (
                <div
                  key={group.id || groupIndex}
                  className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
                >
                  <div className="border-b border-[var(--line)] bg-[#fbf7f2] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <GripVertical size={18} className="text-gray-400" />
                      <input
                        placeholder="Nome do grupo"
                        value={group.title}
                        onChange={(e) => updateGroup(groupIndex, "title", e.target.value)}
                        className="min-w-[220px] flex-1 rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[var(--brand)]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateGroup(groupIndex, "is_active", group.is_active === false)
                        }
                        className={`inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-bold transition-colors ${
                          group.is_active === false
                            ? "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                            : "border-emerald-100 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {group.is_active === false ? (
                          <PlayCircle size={14} />
                        ) : (
                          <PauseCircle size={14} />
                        )}
                        {group.is_active === false ? "Reativar" : "Pausar"}
                      </button>
                      <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-700">
                        <input
                          type="checkbox"
                          checked={group.required}
                          onChange={(e) => updateGroup(groupIndex, "required", e.target.checked)}
                          className="h-4 w-4 accent-[var(--brand)]"
                        />
                        Obrigatório
                      </label>
                      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-700">
                        <span>Máx.</span>
                        <input
                          type="number"
                          value={group.max_options || ""}
                          onChange={(e) =>
                            updateGroup(groupIndex, "max_options", parseInt(e.target.value) || 0)
                          }
                          className="w-12 bg-transparent text-center outline-none"
                          placeholder="0"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGroup(groupIndex)}
                        aria-label={
                          group.persisted
                            ? `Desvincular grupo ${group.title || groupIndex + 1}`
                            : `Remover grupo ${group.title || groupIndex + 1}`
                        }
                        title={group.persisted ? "Desvincular deste produto" : "Remover grupo"}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {(group.linked_product_count || 0) > 1 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                        <strong>Grupo vinculado a {group.linked_product_count} produtos.</strong>{" "}
                        Alterações, preços e pausas deste grupo serão aplicados a todos ao salvar.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="hidden grid-cols-[1fr_140px_auto_auto] gap-3 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 md:grid">
                      <span>Opção</span>
                      <span>Preço adicional</span>
                      <span>Status</span>
                      <span className="w-8" aria-hidden="true" />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-3 text-sm text-gray-500">
                        <Info size={17} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                        <p className="leading-5">
                          Preencha o preço apenas se esta opção tiver custo extra. Deixe em branco para não cobrar acréscimo.
                        </p>
                      </div>
                    </div>

                    {group.options.map((option, optionIndex) => (
                      <div
                        key={option.id || optionIndex}
                        className={`grid gap-3 rounded-xl ${
                          option.is_active === false ? "opacity-60" : ""
                        } md:grid-cols-[1fr_140px_auto_auto]`}
                      >
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 md:hidden">
                            Opção
                          </label>
                          <input
                            placeholder="Nome da opção"
                            value={option.name}
                            onChange={(e) => updateOption(groupIndex, optionIndex, "name", e.target.value)}
                            className="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 md:hidden">
                            Preço adicional
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              aria-label={`Preço adicional de ${option.name || `opção ${optionIndex + 1}`}`}
                              placeholder="0,00"
                              value={option.price || ""}
                              onChange={(e) =>
                                updateOption(groupIndex, optionIndex, "price", e.target.value)
                              }
                              className="w-full rounded-xl border border-[var(--line)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]"
                            />
                          </div>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => toggleOptionActive(groupIndex, optionIndex)}
                            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-bold transition-colors ${
                              option.is_active === false
                                ? "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                : "border-emerald-100 text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {option.is_active === false ? (
                              <PlayCircle size={14} />
                            ) : (
                              <PauseCircle size={14} />
                            )}
                            {option.is_active === false ? "Reativar" : "Pausar"}
                          </button>
                        </div>
                        <div className="flex items-end md:block">
                          <button
                            type="button"
                            onClick={() => removeOptionFromGroup(groupIndex, optionIndex)}
                            aria-label={`Remover opção ${option.name || optionIndex + 1}`}
                            title="Excluir opção"
                            className="rounded-xl p-2 text-gray-400 transition-colors hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addOptionToGroup(groupIndex)}
                      className="rounded-xl bg-[var(--brand-soft)] px-4 py-2 text-xs font-bold text-[var(--brand)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Plus size={13} />
                        Adicionar opção
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          {productToEdit ? (
            <button
              type="button"
              onClick={handleOpenDeleteConfirm}
              disabled={isLoading || isDeleting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              Excluir produto
            </button>
          ) : (
            <span />
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || isDeleting}
              className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-600 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || isDeleting}
              className="brand-gradient rounded-2xl px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="animate-spin" size={16} />
                  Salvando...
                </span>
              ) : (
                "Salvar produto"
              )}
            </button>
          </div>
        </div>
      </div>

      {isDeleteConfirmOpen && productToEdit && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleCloseDeleteConfirm();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
            aria-describedby="delete-product-description"
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-red-100 bg-[#fffdfa] shadow-[0_30px_90px_rgba(17,16,15,0.26)]"
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
                  <h2 id="delete-product-title" className="mt-1 text-2xl font-black tracking-tight text-gray-950">
                    Excluir produto?
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDeleteConfirm}
                disabled={isDeleting}
                aria-label="Fechar confirmação de exclusão"
                className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 transition-colors hover:bg-[#f1ebe3] disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p id="delete-product-description" className="text-sm leading-6 text-gray-600">
                O produto <strong className="font-bold text-gray-950">“{productToEdit.name}”</strong> será removido permanentemente do cardápio. Esta ação não pode ser desfeita.
              </p>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                Se o produto estiver vinculado a uma promoção, prêmio ou recompensa, a exclusão será bloqueada para preservar o histórico.
              </div>

              {deleteError && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-white px-6 py-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleCloseDeleteConfirm}
                disabled={isDeleting}
                className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-[#fbf7f2] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                disabled={isDeleting}
                className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  {isDeleting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {isDeleting ? "Excluindo..." : "Excluir produto"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}