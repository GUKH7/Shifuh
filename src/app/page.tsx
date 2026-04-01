import Link from 'next/link'
import { ArrowRight, CheckCircle, Smartphone, Store, TrendingUp, Zap } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Navegação */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Store className="text-red-600 w-8 h-8" />
          <span className="text-xl font-bold tracking-tight">WhatsMenu</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Entrar
          </Link>
          <Link href="/admin/login" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            Criar Loja
          </Link>
        </div>
      </nav>

      {/* Secção Principal (Hero) */}
      <section className="px-6 py-20 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight">
          O seu restaurante a um <span className="text-red-600">clique</span> de distância.
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Crie o seu cardápio digital em minutos. Receba os pedidos diretamente no WhatsApp, sem pagar comissões por venda às grandes plataformas.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/admin/login" className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-xl text-lg font-bold transition-transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg shadow-red-200">
            Começar Gratuitamente <ArrowRight size={20} />
          </Link>
          <a href="#como-funciona" className="w-full sm:w-auto bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 px-8 py-4 rounded-xl text-lg font-bold transition-colors flex items-center justify-center">
            Ver Funcionalidades
          </a>
        </div>
      </section>

      {/* Funcionalidades (Features) */}
      <section id="como-funciona" className="bg-white py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Tudo o que precisa para gerir e faturar mais</h2>
            <p className="text-gray-600">Uma plataforma completa pensada para o crescimento do seu negócio.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-4">
                <Smartphone size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Pedidos no WhatsApp</h3>
              <p className="text-gray-600">Os clientes montam o pedido no telemóvel e tudo chega formatado e organizado ao seu WhatsApp.</p>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-4">
                <Zap size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Gestão Rápida</h3>
              <p className="text-gray-600">Altere preços, adicione produtos ou pause o atendimento em tempo real através do nosso painel.</p>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Zero Taxas</h3>
              <p className="text-gray-600">Diga adeus às comissões absurdas das aplicações de entrega. O lucro de cada pedido é 100% seu.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabela de Preços (Pricing) */}
      <section className="py-20 px-6 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-12">Planos simples e transparentes</h2>
        
        <div className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden max-w-lg mx-auto relative">
          <div className="absolute top-0 inset-x-0 h-2 bg-red-600"></div>
          <div className="p-8">
            <h3 className="text-2xl font-bold mb-2">Plano Pro</h3>
            <p className="text-gray-500 mb-6">Ideal para quem quer profissionalizar o atendimento.</p>
            <div className="flex items-end justify-center gap-1 mb-8">
              <span className="text-5xl font-extrabold">R$ 49</span>
              <span className="text-gray-500 font-medium mb-1">/mês</span>
            </div>
            
            <ul className="space-y-4 text-left mb-8">
              {[
                'Produtos ilimitados', 
                'Painel de gestão completo', 
                'Cálculo de entrega automático', 
                'Gestão de horários de funcionamento', 
                'Acesso via subdomínio exclusivo'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <CheckCircle className="text-green-500 shrink-0" size={20} />
                  <span className="text-gray-700 font-medium">{item}</span>
                </li>
              ))}
            </ul>
            
            <Link href="/admin/login" className="block w-full bg-gray-900 hover:bg-black text-white py-4 rounded-xl font-bold transition-colors">
              Criar Conta Agora
            </Link>
          </div>
        </div>
      </section>

      {/* Rodapé (Footer) */}
      <footer className="bg-gray-900 text-gray-400 py-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-4 opacity-50">
          <Store size={24} />
          <span className="text-xl font-bold text-white">WhatsMenu</span>
        </div>
        <p>© {new Date().getFullYear()} WhatsMenu. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}