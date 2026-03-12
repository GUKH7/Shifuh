"use client"

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Plus, Trash2, Clock, MapPin, Store, Printer, Palette, UploadCloud, Image as ImageIcon, Smartphone, QrCode, CheckCircle, RefreshCw } from 'lucide-react'

interface DeliveryTier { distance: number; time: number; price: number; }
interface WorkHour { day_id: number; day_label: string; is_open: boolean; open_time: string; close_time: string; }

const DAYS_OF_WEEK = [
  { id: 0, label: "Domingo" }, { id: 1, label: "Segunda-feira" }, { id: 2, label: "Terça-feira" },
  { id: 3, label: "Quarta-feira" }, { id: 4, label: "Quinta-feira" }, { id: 5, label: "Sexta-feira" }, { id: 6, label: "Sábado" },
]

const DEFAULT_SCHEDULE: WorkHour[] = DAYS_OF_WEEK.map(day => ({
  day_id: day.id, day_label: day.label, is_open: true, open_time: "18:00", close_time: "23:00"
}))

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [restaurantId, setRestaurantId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState({ zip: '', street: '', number: '', neighborhood: '', city: '', state: '' })
  
  const [primaryColor, setPrimaryColor] = useState('#DC2626')
  const [logoUrl, setLogoUrl] = useState('')
  const [banners, setBanners] = useState<string[]>([])

  const [printerWidth, setPrinterWidth] = useState(80)
  const [printerFontSize, setPrinterFontSize] = useState(12)

  const [tiers, setTiers] = useState<DeliveryTier[]>([])
  const [schedule, setSchedule] = useState<WorkHour[]>(DEFAULT_SCHEDULE)

  const [wppStatus, setWppStatus] = useState<string>('iniciando')
  const [wppQrCode, setWppQrCode] = useState<string>('')
  const [isRestarting, setIsRestarting] = useState(false)

  useEffect(() => { fetchSettings() }, [])

  useEffect(() => {
    const checkWppStatus = async () => {
      try {
        const res = await fetch('http://64.181.189.107:3001/status')
        const data = await res.json()
        setWppStatus(data.status)
        setWppQrCode(data.qrcode)
      } catch (error) {
        console.error("Erro ao obter status do WhatsApp:", error)
        setWppStatus('desconectado')
      }
    }

    checkWppStatus()
    const interval = setInterval(checkWppStatus, 3000) 
    return () => clearInterval(interval)
  }, [])

  const fetchSettings = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return router.push('/admin/login')

        const { data } = await supabase.from('restaurants').select('*').single()
        
        if (data) {
            setRestaurantId(data.id)
            setName(data.name || "")
            setPhone(data.phone || "")
            setPrimaryColor(data.primary_color || '#DC2626')
            setLogoUrl(data.logo_url || data.image_url || "")
            setBanners(data.banners || [])
            setPrinterWidth(data.printer_width || 80)
            setPrinterFontSize(data.printer_font_size || 12)
            setAddress({
                zip: data.address_zip || '', street: data.address_street || '', number: data.address_number || '',
                neighborhood: data.address_neighborhood || '', city: data.address_city || '', state: data.address_state || ''
            })
            if (data.delivery_tiers) setTiers(data.delivery_tiers)
            else setTiers([{ distance: 1, time: 20, price: 0 }])
            if (data.work_hours) setSchedule(data.work_hours)
        }
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const uploadFile = async (file: File) => {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('restaurant-images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('restaurant-images').getPublicUrl(fileName)
      return data.publicUrl
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return
      setUploading(true)
      try {
          const publicUrl = await uploadFile(e.target.files[0])
          setLogoUrl(publicUrl)
      } catch (error) { alert('Erro ao enviar imagem.'); console.error(error) } finally { setUploading(false) }
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return
      setUploading(true)
      try {
          const publicUrl = await uploadFile(e.target.files[0])
          setBanners([...banners, publicUrl])
      } catch (error) { alert('Erro ao enviar banner.'); console.error(error) } finally { setUploading(false) }
  }

  const handleRemoveBanner = (index: number) => setBanners(banners.filter((_, i) => i !== index))

  const handleSave = async () => {
    setSaving(true)
    const sortedTiers = [...tiers].sort((a, b) => a.distance - b.distance)
    const { error } = await supabase.from('restaurants').update({
            name, phone, delivery_tiers: sortedTiers, work_hours: schedule,
            address_zip: address.zip, address_street: address.street, address_number: address.number,
            address_neighborhood: address.neighborhood, address_city: address.city, address_state: address.state,
            printer_width: printerWidth, printer_font_size: printerFontSize, primary_color: primaryColor,
            logo_url: logoUrl, image_url: logoUrl, banners: banners
        }).eq('id', restaurantId)

    if (error) alert('Erro ao salvar.')
    else { alert('Salvo com sucesso! ✅'); fetchSettings() }
    setSaving(false)
  }

  // ==============================================
  // FUNÇÃO DO BOTÃO DE REINICIAR O WHATSAPP
  // ==============================================
  const handleRestartWpp = async () => {
      setIsRestarting(true)
      setWppStatus('iniciando')
      setWppQrCode('')
      try {
          // Chama a nova rota na Oracle que manda o robô se reiniciar
          await fetch('http://64.181.189.107:3001/restart')
      } catch (error) {
          console.error("Erro ao reiniciar:", error)
      }
      setTimeout(() => setIsRestarting(false), 3000) // Libera o botão após 3 segundos
  }

  const handleBlurCep = async () => {
      const cep = address.zip.replace(/\D/g, '')
      if (cep.length < 8) return
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) setAddress(prev => ({ ...prev, street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf }))
  }
  const updateTier = (index: number, field: keyof DeliveryTier, value: string) => {
    const newTiers = [...tiers]; newTiers[index] = { ...newTiers[index], [field]: parseFloat(value) || 0 }; setTiers(newTiers)
  }
  const addTier = () => setTiers([...tiers, { distance: 1, time: 30, price: 5 }])
  const removeTier = (index: number) => setTiers(tiers.filter((_, i) => i !== index))
  const handleTimeChange = (index: number, field: keyof WorkHour, value: any) => {
    const newSchedule = [...schedule]; 
    // @ts-ignore
    newSchedule[index] = { ...newSchedule[index], [field]: value }; setSchedule(newSchedule)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600"/></div>

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 pb-8 mb-20">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
            <button onClick={handleSave} disabled={saving || uploading} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Salvar
            </button>
        </div>

      <div className="max-w-4xl mx-auto space-y-8 p-6">
        
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Store className="text-red-600"/> Dados da Loja</h2>
            <div className="grid md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-gray-700 mb-1">Nome</label><input value={name} onChange={e => setName(e.target.value)} className="w-full border p-3 rounded-lg outline-none focus:border-red-500" /></div>
                <div><label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border p-3 rounded-lg outline-none focus:border-red-500" /></div>
            </div>
            
            <h3 className="font-bold text-gray-600 text-sm uppercase mt-4">Endereço</h3>
            <div className="grid grid-cols-2 gap-4">
                <input value={address.zip} onChange={e => setAddress({...address, zip: e.target.value})} onBlur={handleBlurCep} className="w-full border p-3 rounded-lg" placeholder="CEP" />
                <input value={address.city} onChange={e => setAddress({...address, city: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50" placeholder="Cidade" />
            </div>
            <div className="grid grid-cols-3 gap-4">
                <input value={address.street} onChange={e => setAddress({...address, street: e.target.value})} className="col-span-2 w-full border p-3 rounded-lg bg-gray-50" placeholder="Rua" />
                <input value={address.number} onChange={e => setAddress({...address, number: e.target.value})} className="w-full border p-3 rounded-lg" placeholder="Número" />
            </div>
        </div>

        <hr />

        {/* ========================================== */}
        {/* CONEXÃO WHATSAPP COM BOTÃO DE REINICIAR    */}
        {/* ========================================== */}
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Smartphone className="text-green-600"/> Conexão WhatsApp
            </h2>
            <div className="grid md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex flex-col justify-center space-y-3">
                    <p className="text-sm text-gray-600">
                        Conecte o seu celular para que o sistema envie automaticamente as notificações de pedido para os clientes.
                    </p>
                    <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span className="text-sm font-bold text-gray-700">Status atual:</span>
                        {wppStatus === 'conectado' && <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">Conectado e Operante</span>}
                        {wppStatus === 'aguardando_qr' && <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Aguardando leitura...</span>}
                        {wppStatus === 'iniciando' && <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Iniciando servidor...</span>}
                        {(wppStatus === 'desconectado' || wppStatus === 'erro' || !wppStatus) && <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">Desconectado</span>}
                        
                        {/* BOTÃO MÁGICO AQUI */}
                        <button 
                            onClick={handleRestartWpp} 
                            disabled={isRestarting}
                            className="ml-auto flex items-center gap-1 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                            title="Desconectar e gerar novo QR Code"
                        >
                            <RefreshCw size={14} className={isRestarting ? "animate-spin" : ""} />
                            Reiniciar
                        </button>

                    </div>
                </div>
                <div className="flex justify-center">
                    <div className="w-48 h-48 bg-white border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center overflow-hidden relative shadow-sm">
                        {wppStatus === 'aguardando_qr' && wppQrCode ? (
                            <img src={wppQrCode} alt="QR Code WhatsApp" className="w-full h-full object-contain p-2" />
                        ) : wppStatus === 'conectado' ? (
                            <div className="text-center text-green-600 flex flex-col items-center">
                                <CheckCircle size={48} className="mb-2" />
                                <span className="font-bold text-sm">Pronto para Enviar!</span>
                            </div>
                        ) : (
                            <div className="text-center text-gray-400 flex flex-col items-center">
                                <QrCode size={48} className="mb-2 opacity-50" /> 
                                <span className="text-xs">Aguardando API...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <hr />

        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Palette className="text-red-600"/> Identidade Visual</h2>
                {uploading && <span className="text-sm text-blue-600 flex items-center gap-2 font-bold"><Loader2 className="animate-spin" size={14}/> Enviando imagem...</span>}
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Logo da Loja</label>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-white overflow-hidden relative">
                            {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-300"/>}
                        </div>
                        <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-50 flex items-center gap-2">
                            <UploadCloud size={16}/> Trocar Logo
                            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                        </label>
                    </div>

                    <label className="block text-sm font-bold text-gray-700 mb-2">Cor Principal</label>
                    <div className="flex items-center gap-3">
                        <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-12 h-12 p-1 rounded-lg border cursor-pointer"/>
                        <span className="font-mono text-gray-500 font-medium">{primaryColor}</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Banners Promocionais</label>
                    
                    <label className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors mb-3">
                        <Plus className="text-gray-400 mb-1"/>
                        <span className="text-xs font-bold text-gray-500">Clique para adicionar banner</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} disabled={uploading} />
                    </label>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {banners.map((b, i) => (
                            <div key={i} className="flex items-center justify-between bg-white p-2 border rounded-lg shadow-sm group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <img src={b} className="w-12 h-8 object-cover rounded bg-gray-100" />
                                    <span className="text-xs text-gray-400 truncate max-w-[150px]">Banner {i + 1}</span>
                                </div>
                                <button onClick={() => handleRemoveBanner(i)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                            </div>
                        ))}
                        {banners.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhum banner adicionado.</p>}
                    </div>
                </div>
            </div>
        </div>

        <hr />

        <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Printer className="text-red-600"/> Impressão</h2>
            <div className="grid md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Largura</label>
                    <div className="flex gap-4">
                        <label className={`flex-1 p-3 rounded-lg border cursor-pointer flex items-center justify-center gap-2 ${printerWidth === 80 ? 'border-red-500 bg-white shadow-sm' : 'border-gray-300'}`}><input type="radio" name="width" className="hidden" checked={printerWidth === 80} onChange={() => setPrinterWidth(80)} /><span className="font-bold">80mm</span></label>
                        <label className={`flex-1 p-3 rounded-lg border cursor-pointer flex items-center justify-center gap-2 ${printerWidth === 58 ? 'border-red-500 bg-white shadow-sm' : 'border-gray-300'}`}><input type="radio" name="width" className="hidden" checked={printerWidth === 58} onChange={() => setPrinterWidth(58)} /><span className="font-bold">58mm</span></label>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Tamanho Fonte: {printerFontSize}px</label>
                    <input type="range" min="10" max="24" step="1" value={printerFontSize} onChange={(e) => setPrinterFontSize(Number(e.target.value))} className="w-full accent-red-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                </div>
            </div>
        </div>

        <hr />
        
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><MapPin className="text-red-600"/> Taxas de Entrega</h2>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                {tiers.map((tier, index) => (
                    <div key={index} className="grid grid-cols-10 gap-4 items-center">
                        <div className="col-span-3 relative"><input type="number" value={tier.distance} onChange={(e) => updateTier(index, 'distance', e.target.value)} className="w-full pl-3 pr-8 py-2 border rounded font-bold" /><span className="absolute right-3 top-2.5 text-xs text-gray-400 font-bold">km</span></div>
                        <div className="col-span-3 relative"><input type="number" value={tier.time} onChange={(e) => updateTier(index, 'time', e.target.value)} className="w-full pl-3 pr-10 py-2 border rounded" /><span className="absolute right-3 top-2.5 text-xs text-gray-400">min</span></div>
                        <div className="col-span-3 relative"><span className="absolute left-3 top-2.5 text-xs text-green-600 font-bold">R$</span><input type="number" value={tier.price} onChange={(e) => updateTier(index, 'price', e.target.value)} className="w-full pl-8 pr-3 py-2 border rounded font-bold" /></div>
                        <div className="col-span-1 flex justify-center"><button onClick={() => removeTier(index)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={18} /></button></div>
                    </div>
                ))}
                <button onClick={addTier} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-bold hover:border-red-500 hover:text-red-600 flex items-center justify-center gap-2"><Plus size={18} /> Adicionar Faixa</button>
            </div>
        </div>

        <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Clock className="text-red-600"/> Horários</h2>
            <div className="border border-gray-200 rounded-xl divide-y">
                {schedule.map((item, index) => (
                    <div key={item.day_id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3"><input type="checkbox" checked={item.is_open} onChange={(e) => handleTimeChange(index, 'is_open', e.target.checked)} className="w-5 h-5 accent-red-600" /><span className={item.is_open ? 'font-bold' : 'text-gray-400'}>{item.day_label}</span></div>
                        {item.is_open && <div className="flex items-center gap-2"><input type="time" value={item.open_time} onChange={(e) => handleTimeChange(index, 'open_time', e.target.value)} className="border p-1 rounded" /><span>às</span><input type="time" value={item.close_time} onChange={(e) => handleTimeChange(index, 'close_time', e.target.value)} className="border p-1 rounded" /></div>}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  )
}