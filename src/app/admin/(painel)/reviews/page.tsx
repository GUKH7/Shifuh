"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { useRouter } from "next/navigation"
import { Star, Loader2, Quote, ThumbsUp, Calendar } from "lucide-react"

export default function ReviewsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<any[]>([])
  const [stats, setStats] = useState({ average: 0, total: 0, starsBreakdown: [0,0,0,0,0] })

  useEffect(() => {
    fetchReviews()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchReviews = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.push("/admin/login")

    const { data: resto } = await supabase.from('restaurants').select('id').single()
    if (!resto) return

    const { data } = await supabase
        .from('reviews')
        .select(`*, orders (customer_name, id)`)
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false })

    if (data) {
        setReviews(data)
        calculateStats(data)
    }
    setLoading(false)
  }

  const calculateStats = (data: any[]) => {
      if (data.length === 0) return setStats({ average: 0, total: 0, starsBreakdown: [0,0,0,0,0] })

      const total = data.length
      const sum = data.reduce((acc, curr) => acc + curr.rating, 0)
      const average = sum / total
      const breakdown = [0, 0, 0, 0, 0]
      data.forEach(r => { if (r.rating >= 1 && r.rating <= 5) breakdown[r.rating - 1]++ })

      setStats({ average, total, starsBreakdown: breakdown })
  }

  const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      })
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Star className="text-red-600 fill-red-600"/> Avaliações da Loja
        </h1>
        <p className="text-gray-500 text-sm">Veja o que seus clientes estão falando sobre seus pedidos.</p>
      </div>

      {/* DASHBOARD DE NOTAS */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div>
                  <p className="text-gray-500 font-medium mb-1">Nota Média</p>
                  <p className="text-4xl font-black text-gray-800 flex items-center gap-2">
                      {stats.average.toFixed(1)} <Star size={28} className="text-yellow-400 fill-yellow-400"/>
                  </p>
              </div>
              <div className="text-right">
                  <p className="text-gray-400 text-sm">{stats.total} avaliações</p>
                  <p className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full mt-2 inline-block">
                    {stats.average >= 4.5 ? 'Excelente' : stats.average >= 3 ? 'Bom' : 'Atenção'}
                  </p>
              </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                      const count = stats.starsBreakdown[star - 1]
                      const percent = stats.total > 0 ? (count / stats.total) * 100 : 0
                      return (
                          <div key={star} className="flex items-center gap-3 text-xs">
                              <span className="font-bold w-3">{star}</span>
                              <Star size={12} className="text-gray-300"/>
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${percent}%` }}></div>
                              </div>
                              <span className="text-gray-400 w-8 text-right">{count}</span>
                          </div>
                      )
                  })}
              </div>
          </div>
      </div>

      {/* LISTA DE REVIEWS */}
      <div className="space-y-4">
          {reviews.length === 0 && (
              <div className="bg-white p-12 rounded-xl border border-dashed text-center text-gray-400">
                  Nenhuma avaliação recebida ainda.
              </div>
          )}

          {reviews.map(review => (
              <div key={review.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
                  {/* ESQUERDA: CLIENTE E NOTA */}
                  <div className="md:w-48 flex-shrink-0">
                      <div className="flex gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} size={16} className={s <= review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
                          ))}
                      </div>
                      <p className="font-bold text-gray-800 text-sm">{review.orders?.customer_name || "Cliente"}</p>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <Calendar size={10}/> {formatDate(review.created_at)}
                      </div>
                      <div className="mt-2 inline-block bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-mono">
                          Pedido #{review.orders?.id.slice(0,4)}
                      </div>
                  </div>

                  {/* DIREITA: COMENTÁRIO (CORRIGIDO) */}
                  <div className="flex-1 border-l border-gray-100 md:pl-6 pt-4 md:pt-0">
                      {review.comment ? (
                          <div className="flex gap-3">
                              {/* Ícone de Citação agora é flex item, não absolute (evita bugs visuais) */}
                              <Quote className="text-gray-200 flex-shrink-0 fill-gray-100" size={24}/>
                              <div>
                                  {/* whitespace-pre-wrap: Mantém quebras de linha se o cliente der enter */}
                                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                                      {review.comment}
                                  </p>
                              </div>
                          </div>
                      ) : (
                          <p className="text-gray-300 text-sm italic">O cliente não deixou comentário, apenas a nota.</p>
                      )}
                      
                      {review.rating === 5 && (
                          <div className="mt-4 ml-9 flex items-center gap-2 text-green-600 text-xs font-bold bg-green-50 px-3 py-1 rounded-full w-fit">
                              <ThumbsUp size={12}/> Cliente muito satisfeito!
                          </div>
                      )}
                  </div>
              </div>
          ))}
      </div>
    </div>
  )
}