"use client"

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Store, Loader2, ArrowRight } from 'lucide-react'

export default function AdminLogin() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setRestaurantName(newName)
    setRestaurantSlug(newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''))
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      if (isRegistering) {
        if (!restaurantName.trim() || !restaurantSlug.trim()) {
          throw new Error("Preencha o nome e o link da sua loja.")
        }

        const { data: existingSlug } = await supabase.from('restaurants').select('id').eq('slug', restaurantSlug).maybeSingle()
        if (existingSlug) throw new Error("Este link já está em uso.")

        // 1. Cria usuário
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
        if (authError) throw authError

        // 2. Força o login imediatamente para gravar a sessão no navegador (Evita o loop infinito)
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) throw loginError

        // 3. Cria loja vinculada ao usuário
        if (authData.user) {
          const { error: dbError } = await supabase.from('restaurants').insert({
            name: restaurantName.trim(),
            slug: restaurantSlug.trim(),
            user_id: authData.user.id
          })
          
          if (dbError) {
            console.error("Erro no banco:", dbError)
            throw new Error("Conta criada, mas erro ao salvar a loja: " + dbError.message)
          }
          
          router.push('/admin') // Vai direto pro painel
        }
      } else {
        // Fluxo de login normal
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/admin')
      }
    } catch (error: any) {
      setErrorMsg(error.message || 'Ocorreu um erro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
          <Store className="text-red-600 w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900">
          {isRegistering ? 'Crie sua loja digital' : 'Painel do Lojista'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          {errorMsg && <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium text-center">{errorMsg}</div>}

          <form className="space-y-5" onSubmit={handleAuth}>
            {isRegistering && (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Nome do seu Negócio</label>
                  <input type="text" required value={restaurantName} onChange={handleNameChange} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-red-500 focus:border-red-500" placeholder="Ex: Burger House" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Link do seu Cardápio</label>
                  <div className="mt-1 flex shadow-sm rounded-xl">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">whatsmenu.com/</span>
                    <input type="text" required value={restaurantSlug} onChange={(e) => setRestaurantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="flex-1 block w-full px-4 py-3 border border-gray-300 rounded-r-xl focus:ring-red-500 focus:border-red-500" />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-red-500 focus:border-red-500" placeholder="seu@email.com" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700">Senha</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-red-500 focus:border-red-500" placeholder="••••••••" />
            </div>

            <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <>{isRegistering ? 'Criar Loja e Entrar' : 'Entrar no Painel'} <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <button onClick={() => { setIsRegistering(!isRegistering); setErrorMsg(''); }} className="text-sm font-bold text-gray-600 hover:text-red-600 transition-colors">
              {isRegistering ? 'Já tem uma conta? Faça login.' : 'Ainda não tem loja? Crie uma conta.'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}