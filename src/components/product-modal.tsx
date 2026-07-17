"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { GripVertical, Loader2, Plus, Scissors, Trash2, Upload, X } from "lucide-react";
import Cropper from "react-easy-crop";

interface AddonOption {
  name: string;
  price: number;
}

interface AddonGroup {
  id: string;
  title: string;
  required: boolean;
  max_options: number;
  options: AddonOption[];
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [croppedImageBlob, setCroppedImageBlob] = useState<Blob | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (productToEdit) {
      setName(productToEdit.name);
      setDescription(productToEdit.description || "");
      setPrice(productToEdit.price.toString());
      setCategoryId(productToEdit.category_id);
      setImageUrl(productToEdit.image_url);

      if (productToEdit.addons && Array.isArray(productToEdit.addons)) {
        if (productToEdit.addons.length > 0 && productToEdit.addons[0].title) {
          setAddonGroups(productToEdit.addons);
        } else if (productToEdit.addons.length > 0) {
          setAddonGroups([
            {
              id: crypto.randomUUID(),
              title: "Adicionais",
              required: false,
              max_options: 0,
              options: productToEdit.addons,
            },
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
      setCroppedImageBlob(null);
      setImageSrc(null);
      if (categories.length > 0) setCategoryId(categories[0].id);
    }
  }, [isOpen, productToEdit, categories]);

  const addGroup = () => {
    setAddonGroups([
      ...addonGroups,
      {
        id: crypto.randomUUID(),
        title: "",
        required: false,
        max_options: 0,
        options: [{ name: "", price: 0 }],
      },
    ]);
  };

  const removeGroup = (index: number) => {
    const newGroups = [...addonGroups];
    newGroups.splice(index, 1);
    setAddonGroups(newGroups);
  };

  const updateGroup = (index: number, field: keyof AddonGroup, value: any) => {
    const newGroups = [...addonGroups];
    newGroups[index] = { ...newGroups[index], [field]: value };
    setAddonGroups(newGroups);
  };

  const addOptionToGroup = (groupIndex: number) => {
    const newGroups = [...addonGroups];
    newGroups[groupIndex].options.push({ name: "", price: 0 });
    setAddonGroups(newGroups);
  };

  const removeOptionFromGroup = (groupIndex: number, optionIndex: number) => {
    const newGroups = [...addonGroups];
    newGroups[groupIndex].options.splice(optionIndex, 1);
    setAddonGroups(newGroups);
  };

  const updateOption = (
    groupIndex: number,
    optionIndex: number,
    field: "name" | "price",
    value: string,
  ) => {
    const newGroups = [...addonGroups];
    const option = newGroups[groupIndex].options[optionIndex];
    if (field === "price") option.price = parseFloat(value) || 0;
    else option.name = value;
    setAddonGroups(newGroups);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setIsCropping(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const showCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    setCroppedImageBlob(blob);
    setIsCropping(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !categoryId) return alert("Categoria obrigatória!");
    setIsLoading(true);

    try {
      let finalUrl = imageUrl;

      if (croppedImageBlob) {
        const fileName = `${restaurantId}/${Date.now()}-prod.jpg`;
        const { error: upErr } = await supabase.storage
          .from("menu-images")
          .upload(fileName, croppedImageBlob);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("menu-images").getPublicUrl(fileName);
        finalUrl = data.publicUrl;
      }

      const cleanGroups = addonGroups
        .filter((group) => group.title.trim() !== "")
        .map((group) => ({
          ...group,
          options: group.options.filter((option) => option.name.trim() !== ""),
        }));

      const payload = {
        restaurant_id: restaurantId,
        category_id: categoryId,
        name,
        description,
        price: parseFloat(price.replace(",", ".")),
        image_url: finalUrl,
        addons: cleanGroups,
      };

      let error;
      if (productToEdit) {
        const { error: updateErr } = await supabase
          .from("products")
          .update(payload)
          .eq("id", productToEdit.id);
        error = updateErr;
      } else {
        const { error: insertErr } = await supabase.from("products").insert(payload);
        error = insertErr;
      }

      if (error) throw error;

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
          <button onClick={() => setIsCropping(false)}>
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
            onClick={showCroppedImage}
            className="brand-gradient w-full rounded-2xl py-3 font-bold text-white"
          >
            Confirmar recorte
          </button>
        </div>
      </div>
    );
  }

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
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf7f2] text-gray-500 transition-colors hover:bg-[#f1ebe3] hover:text-gray-700"
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
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
              />
              {croppedImageBlob ? (
                <img src={URL.createObjectURL(croppedImageBlob)} className="h-full w-full object-cover" />
              ) : imageUrl ? (
                <img src={imageUrl} className="h-full w-full object-cover" />
              ) : (
                <div className="text-center text-xs font-medium text-gray-500">
                  <Upload className="mx-auto mb-2 text-gray-400" size={22} />
                  Adicionar foto
                </div>
              )}
              <div className="absolute inset-0 hidden items-center justify-center bg-black/45 text-xs font-bold text-white group-hover:flex">
                Alterar
              </div>
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
            </div>
          </div>

          <div className="rounded-[26px] border border-[var(--line)] bg-[#fcfaf7] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-gray-700">
                  <Scissors size={16} className="text-[var(--brand)]" />
                  Complementos
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Crie grupos para adicionais, tamanhos ou observações de preparo.
                </p>
              </div>
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
                  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[#fbf7f2] px-4 py-3">
                    <GripVertical size={18} className="text-gray-400" />
                    <input
                      placeholder="Nome do grupo"
                      value={group.title}
                      onChange={(e) => updateGroup(groupIndex, "title", e.target.value)}
                      className="min-w-[220px] flex-1 rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-bold outline-none focus:border-[var(--brand)]"
                    />
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
                          updateGroup(groupIndex, "max_options", parseInt(e.target.value))
                        }
                        className="w-12 bg-transparent text-center outline-none"
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGroup(groupIndex)}
                      className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="space-y-3 p-4">
                    {group.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="grid gap-3 md:grid-cols-[1fr_120px_auto]">
                        <input
                          placeholder="Nome da opção"
                          value={option.name}
                          onChange={(e) => updateOption(groupIndex, optionIndex, "name", e.target.value)}
                          className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                        />
                        <input
                          type="number"
                          placeholder="0.00"
                          value={option.price}
                          onChange={(e) =>
                            updateOption(groupIndex, optionIndex, "price", e.target.value)
                          }
                          className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
                        />
                        <button
                          type="button"
                          onClick={() => removeOptionFromGroup(groupIndex, optionIndex)}
                          className="rounded-xl p-2 text-gray-400 hover:bg-[#fff0e8] hover:text-[var(--brand)]"
                        >
                          <X size={16} />
                        </button>
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

        <div className="flex justify-end gap-3 border-t border-[var(--line)] bg-white px-6 py-5">
          <button
            onClick={onClose}
            className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
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
  );
}
