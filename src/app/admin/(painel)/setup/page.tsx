"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Store, Loader2, ArrowRight, CheckCircle2 } from "lucide-react"

export default function SetupPage() {
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [user, setUser] = useState<any>(null)
  
  // Campos do formulário
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return router.push("/admin/login")
    }
    setUser(user)

    // Verifica se já tem restaurante. Se tiver, manda para o painel.
    const { data: resto } = await supabase
      .from('restaurants')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (resto) {
      router.push("/admin")
    } else {
      setLoading(false)
    }
  }

  // Gera o slug automaticamente com base no nome
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setName(newName)
    setSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''))
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) {
      setError("Preencha todos os campos obrigatórios.")
      return
    }

    setIsSaving(true)
    setError("")

    try {
      // 1. Verificar se o slug já existe (pois tem de ser único para o link)
      const { data: existingSlug } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (existingSlug) {
        setError("Este link já está a ser utilizado. Tente adicionar números ou a sua cidade (ex: burger-house-sp).")
        setIsSaving(false)
        return
      }

      // 2. Criar o restaurante no banco de dados
      const { error: insertError } = await supabase
        .from('restaurants')
        .insert({
          name: name.trim(),
          slug: slug.trim(),
          user_id: user.id
        })

      if (insertError) throw insertError

      // 3. Sucesso! Redirecionar para o painel
      router.push("/admin")

    } catch (err: any) {
      console.error(err)
      setError("Ocorreu um erro ao criar o restaurante. Tente novamente.")
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F2F4F7]"><Loader2 className="animate-spin text-red-600" size={32} /></div>
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F4F7] p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600">
            <Store size={32} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Bem-vindo ao WhatsMenu! 🎉</h1>
          <p className="text-gray-500 text-sm">Vamos configurar o seu catálogo digital. Como se chama o seu negócio?</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nome do Restaurante</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={handleNameChange}
              placeholder="Ex: Burger House"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Link do seu Cardápio</label>
            <div className="flex items-center">
              <span className="bg-gray-100 border border-r-0 border-gray-300 px-3 py-3 rounded-l-lg text-gray-500 text-sm select-none">
                whatsmenu.com/
              </span>
              <input 
                type="text" 
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="w-full px-4 py-3 rounded-r-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Este será o link que vai partilhar com os seus clientes.</p>
          </div>

          <button 
            type="submit" 
            disabled={isSaving}
            className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isSaving ? (
              <><Loader2 size={20} className="animate-spin" /> A criar restaurante...</>
            ) : (
              <>Concluir Configuração <CheckCircle2 size={20} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
