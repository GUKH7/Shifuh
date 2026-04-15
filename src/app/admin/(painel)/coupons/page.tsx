"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Ticket, Trash2, Plus, Loader2, Tag } from "lucide-react"

export default function CouponsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [coupons, setCoupons] = useState<any[]>([])
  
  // Formulário
  const [code, setCode] = useState("")
  // Mudei de 'value' para 'discountValue' para evitar conflito de nomes
  const [discountValue, setDiscountValue] = useState("") 
  const [type, setType] = useState("percent") // percent ou fixed
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchCoupons()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCoupons = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/admin/login")

    const { data: resto } = await supabase.from('restaurants').select('id').single()
    if (!resto) return

    const { data } = await supabase
        .from('coupons')
        .select('*')
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false })

    if (data) setCoupons(data)
    setLoading(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!code || !discountValue) return alert("Preencha todos os campos")
      
      setCreating(true)
      
      try {
        const { data: resto } = await supabase.from('restaurants').select('id').single()
        
        if (resto) {
            await supabase.from('coupons').insert({
                restaurant_id: resto.id,
                code: code.toUpperCase().trim(),
                // Aqui usamos discountValue convertendo para número
                value: parseFloat(discountValue.replace(',', '.')),
                discount_type: type,
                active: true
            })

            setCode("")
            setDiscountValue("")
            fetchCoupons()
        }
      } catch (error) {
          console.error(error)
          alert("Erro ao criar cupom")
      } finally {
          setCreating(false)
      }
  }

  const handleDelete = async (id: string) => {
      if (!confirm("Tem certeza que deseja apagar este cupom?")) return
      await supabase.from('coupons').delete().eq('id', id)
      setCoupons(coupons.filter(c => c.id !== id))
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Ticket className="text-red-600"/> Meus Cupons
        </h1>
        <p className="text-gray-500 text-sm">Crie códigos promocionais para seus clientes.</p>
      </div>

      {/* FORMULÁRIO DE CRIAÇÃO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <h2 className="font-bold text-gray-700 mb-4 text-sm uppercase">Novo Cupom</h2>
          <form onSubmit={handleCreate} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-gray-500 mb-1">CÓDIGO (Ex: PROMO10)</label>
                  <div className="relative">
                      <Tag className="absolute left-3 top-3 text-gray-400" size={18}/>
                      <input 
                        value={code} 
                        onChange={e => setCode(e.target.value)} 
                        className="w-full pl-10 p-2.5 border rounded-lg outline-none focus:border-red-500 uppercase font-bold text-gray-700 placeholder:font-normal" 
                        placeholder="DIGITE O CÓDIGO"
                      />
                  </div>
              </div>
              
              <div className="w-full md:w-32">
                  <label className="block text-xs font-bold text-gray-500 mb-1">TIPO</label>
                  <select 
                    value={type} 
                    onChange={e => setType(e.target.value)} 
                    className="w-full p-2.5 border rounded-lg outline-none bg-white text-gray-700"
                  >
                      <option value="percent">Porcentagem (%)</option>
                      <option value="fixed">Valor Fixo (R$)</option>
                  </select>
              </div>

              <div className="w-full md:w-32">
                  <label className="block text-xs font-bold text-gray-500 mb-1">VALOR</label>
                  <input 
                    type="number" 
                    value={discountValue} 
                    onChange={e => setDiscountValue(e.target.value)} 
                    className="w-full p-2.5 border rounded-lg outline-none focus:border-red-500 font-bold text-gray-700" 
                    placeholder="0.00"
                  />
              </div>

              <button disabled={creating} type="submit" className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors">
                  {creating ? <Loader2 className="animate-spin" size={20}/> : <Plus size={20}/>} Criar
              </button>
          </form>
      </div>

      {/* LISTA DE CUPONS */}
      <div className="space-y-3">
          {coupons.length === 0 && (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  Nenhum cupom ativo no momento.
              </div>
          )}

          {coupons.map(cupom => (
              <div key={cupom.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                      <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                          <Ticket className="text-red-600" size={24}/>
                      </div>
                      <div>
                          <p className="text-xl font-black text-gray-800 tracking-wide">{cupom.code}</p>
                          <p className="text-sm text-gray-500">
                              Desconto de <span className="font-bold text-green-600">
                                  {cupom.discount_type === 'percent' ? `${cupom.value}%` : `R$ ${cupom.value.toFixed(2)}`}
                              </span>
                          </p>
                      </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(cupom.id)}
                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    title="Excluir Cupom"
                  >
                      <Trash2 size={20}/>
                  </button>
              </div>
          ))}
      </div>
    </div>
  )
}