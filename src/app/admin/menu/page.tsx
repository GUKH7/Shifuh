"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Plus, Search, Power, Edit3, ChevronDown, ChevronUp, GripVertical, Trash2, Save, X, Loader2 } from "lucide-react"
import ProductModal from "@/components/product-modal"

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  
  // --- CONTROLE DO MODAL DE PRODUTO ---
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)

  // Estados de Categoria
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null)
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    checkUser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/admin/login")
    fetchData()
  }

  const fetchData = async () => {
    try {
      // Opcional mas recomendado: pegar o usuário logado para filtrar
      const { data: { user } } = await supabase.auth.getUser()

      const { data: resto, error } = await supabase
        .from('restaurants')
        .select('*')
        // .eq('user_id', user?.id) // Descomente esta linha se a sua tabela restaurants tiver a coluna user_id
        .maybeSingle() // <- Evita o erro 406 Not Acceptable

      // Se não encontrou o restaurante, interrompe aqui e não tenta acessar resto.id
      if (error || !resto) {
        console.error("Nenhum restaurante encontrado para este usuário.", error)
        return 
      }

      setRestaurant(resto)

      // Agora é 100% seguro usar resto.id
      const { data: cats } = await supabase.from('categories').select('*').eq('restaurant_id', resto.id).order('order')
      if (cats) {
        setCategories(cats)
        setExpandedCategories(prev => {
          if (Object.keys(prev).length === 0) {
            const initial: any = {}
            cats.forEach((c: any) => initial[c.id] = true)
            return initial
          }
          return prev
        })
      }

      const { data: prods } = await supabase.from('products').select('*').eq('restaurant_id', resto.id)
      if (prods) setProducts(prods)

    } catch (err) {
      console.error("Erro inesperado ao buscar cardápio:", err)
    } finally {
      // O finally garante que o loading sempre ficará false, dando certo ou errado
      setLoading(false)
    }
  }
  // --- AÇÕES DE PRODUTO ---
  const handleOpenNewProduct = () => {
      setEditingProduct(null)
      setIsProductModalOpen(true)
  }

  const handleEditProduct = (product: any) => {
      setEditingProduct(product)
      setIsProductModalOpen(true)
  }

  const handleProductSaved = () => {
      fetchData()
      setIsProductModalOpen(false)
  }

  const toggleProductStatus = async (product: any) => {
    const newStatus = !product.is_active
    // Atualização Otimista (Visual)
    setProducts(current => 
        current.map(p => p.id === product.id ? { ...p, is_active: newStatus } : p)
    )
    // Banco
    await supabase.from('products').update({ is_active: newStatus }).eq('id', product.id)
  }

  // --- AÇÕES DE CATEGORIA ---
  const handleAddCategory = async () => {
    const name = prompt("Nome da nova categoria (ex: Lanches, Bebidas):")
    if (!name) return

    const nextOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order)) + 1 : 1
    const { data } = await supabase.from('categories').insert({ 
        name, restaurant_id: restaurant.id, order: nextOrder 
    }).select().single()

    if (data) {
        setCategories([...categories, data])
        setExpandedCategories(prev => ({...prev, [data.id]: true}))
    }
  }

  const handleDeleteCategory = async (id: string) => {
    if(!confirm("Tem certeza? Produtos nesta categoria ficarão ocultos!")) return;
    await supabase.from('categories').delete().eq('id', id)
    setCategories(categories.filter(c => c.id !== id))
  }

  const startEditingCat = (cat: any) => {
      setEditingCategoryId(cat.id)
      setEditingName(cat.name)
  }

  const saveCategoryName = async (id: string) => {
      if(!editingName.trim()) return;
      await supabase.from('categories').update({ name: editingName }).eq('id', id)
      setCategories(categories.map(c => c.id === id ? { ...c, name: editingName } : c))
      setEditingCategoryId(null)
  }

  // --- DRAG AND DROP CATEGORIAS ---
  const handleDragStart = (index: number) => setDraggedCategoryIndex(index)
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedCategoryIndex === null || draggedCategoryIndex === index) return
    const newCats = [...categories]
    const item = newCats[draggedCategoryIndex]
    newCats.splice(draggedCategoryIndex, 1)
    newCats.splice(index, 0, item)
    setCategories(newCats)
    setDraggedCategoryIndex(index)
  }
  const handleDragEnd = async () => {
    setDraggedCategoryIndex(null)
    setIsSavingCategory(true)
    const updates = categories.map((cat, index) => ({ id: cat.id, order: index + 1 }))
    for (const update of updates) {
        await supabase.from('categories').update({ order: update.order }).eq('id', update.id)
    }
    setIsSavingCategory(false)
  }

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({...prev, [catId]: !prev[catId]}))
  }
  const formatPrice = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

  if (loading) return <div className="flex items-center justify-center h-64 text-red-600 font-bold"><Loader2 className="animate-spin mr-2"/> Carregando Cardápio...</div>

  return (
    <div className="max-w-5xl mx-auto font-sans pb-20">
      
      {/* Header da Página */}
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
          <div>
              <h2 className="text-2xl font-bold text-gray-800">Cardápio Digital</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  {isSavingCategory ? <span className="text-orange-500 font-bold flex gap-1"><Loader2 size={14} className="animate-spin"/> Salvando ordem...</span> : <span>Gerencie seus produtos e categorias</span>}
              </div>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                      type="text" 
                      placeholder="Buscar item..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm shadow-sm"
                  />
              </div>
              
              <button 
                  onClick={handleAddCategory}
                  className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-[0.95] text-sm"
              >
                  <Plus size={16} /> Categoria
              </button>
              <button 
                  onClick={handleOpenNewProduct} 
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-[0.95] text-sm"
              >
                  <Plus size={16} /> Produto
              </button>
          </div>
      </div>

      {/* Lista de Categorias */}
      <div className="space-y-6">
          {categories.map((category, index) => {
              const catProducts = products.filter(p => 
                  p.category_id === category.id && 
                  p.name.toLowerCase().includes(searchTerm.toLowerCase())
              )
              if (searchTerm && catProducts.length === 0) return null
              const isExpanded = expandedCategories[category.id]
              const isEditing = editingCategoryId === category.id

              return (
                  <div 
                      key={category.id} 
                      draggable={!isEditing} 
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden transition-all
                          ${draggedCategoryIndex === index ? 'opacity-40 border-dashed border-red-400' : ''}
                      `}
                  >
                      {/* Header Categoria */}
                      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-50 group">
                          <div className="flex items-center gap-3 flex-1">
                              <div className="cursor-move text-gray-300 hover:text-gray-600 p-1">
                                  <GripVertical size={20} />
                              </div>
                              {isEditing ? (
                                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                      <input 
                                          autoFocus
                                          value={editingName}
                                          onChange={e => setEditingName(e.target.value)}
                                          className="border border-red-300 rounded px-2 py-1 text-lg font-bold text-gray-800 outline-none focus:ring-2 focus:ring-red-200"
                                      />
                                      <button onClick={() => saveCategoryName(category.id)} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save size={16}/></button>
                                      <button onClick={() => setEditingCategoryId(null)} className="p-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"><X size={16}/></button>
                                  </div>
                              ) : (
                                  <div className="flex items-center gap-3" onClick={() => toggleCategory(category.id)}>
                                      <h3 className="font-bold text-lg text-gray-800 cursor-pointer hover:text-red-600 transition-colors">{category.name}</h3>
                                      <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{catProducts.length} itens</span>
                                      <button onClick={(e) => { e.stopPropagation(); startEditingCat(category); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all" title="Renomear">
                                          <Edit3 size={14} />
                                      </button>
                                  </div>
                              )}
                          </div>

                          <div className="flex items-center gap-2">
                              <button onClick={() => handleDeleteCategory(category.id)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Excluir Categoria">
                                  <Trash2 size={16} />
                              </button>
                              <button onClick={() => toggleCategory(category.id)} className="text-gray-400 hover:bg-gray-100 p-1 rounded transition-colors">
                                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </button>
                          </div>
                      </div>

                      {/* LISTA DE PRODUTOS */}
                      {isExpanded && (
                          <div className="divide-y divide-gray-50">
                              {catProducts.length > 0 ? (
                                  catProducts.map((product) => (
                                      <div 
                                          key={product.id} 
                                          className={`group p-4 flex items-center gap-4 hover:bg-gray-50/80 transition-colors ${!product.is_active ? 'opacity-60 bg-gray-50' : ''}`}
                                      >
                                          
                                          <div className="w-14 h-14 bg-gray-100 rounded-md overflow-hidden border border-gray-200 flex-shrink-0 relative">
                                              {product.image_url ? (
                                                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                              ) : (
                                                  <div className="w-full h-full flex items-center justify-center text-gray-300"><span className="text-[9px]">FOTO</span></div>
                                              )}
                                              {!product.is_active && (
                                                <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-[1px]">
                                                    <Power size={16} className="text-gray-500" />
                                                </div>
                                              )}
                                          </div>

                                          <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2">
                                                  <h4 className="font-bold text-gray-800 text-sm">{product.name}</h4>
                                                  {!product.is_active && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 rounded font-bold uppercase tracking-wider">Pausado</span>}
                                              </div>
                                              <p className="text-xs text-gray-500 truncate max-w-lg mt-0.5">{product.description}</p>
                                              <div className="mt-1 font-semibold text-gray-900 text-sm">{formatPrice(product.price)}</div>
                                          </div>

                                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button 
                                                  onClick={() => handleEditProduct(product)} 
                                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-md hover:border-red-200 hover:text-red-600 shadow-sm transition-all"
                                              >
                                                  <Edit3 size={12} /> Editar
                                              </button>
                                              
                                              <button 
                                                  onClick={() => toggleProductStatus(product)}
                                                  className={`p-1.5 rounded transition-colors ${
                                                      product.is_active 
                                                      ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' 
                                                      : 'text-red-600 bg-red-50 hover:bg-red-100 ring-1 ring-red-100'
                                                  }`}
                                                  title={product.is_active ? "Pausar Vendas" : "Ativar Vendas"}
                                              >
                                                  <Power size={16} />
                                              </button>
                                          </div>
                                      </div>
                                  ))
                              ) : (
                                  <div className="p-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                                      <span className="text-sm">Categoria vazia</span>
                                      <button 
                                          onClick={handleOpenNewProduct}
                                          className="text-red-600 font-bold text-xs hover:underline bg-red-50 px-3 py-1.5 rounded-full transition-colors"
                                      >
                                          + Adicionar Produto aqui
                                      </button>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )
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
  )
}