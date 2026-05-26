"use client"

import { useState, FormEvent, useRef } from "react"
import { useCart } from "@/contexts/cart-context"
import { X, MapPin, Loader2, Search } from "lucide-react"

type CheckoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const { items, total, deliveryFee, deliveryTime, setUserLocation, clearCart } = useCart();

  const [name, setName] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const numberInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, "$1-$2");
    setCep(value);
  };

  const handleCepBlur = async () => {
    const cepClean = cep.replace(/\D/g, "");
    if (cepClean.length !== 8) return;
    setLoadingCep(true);
    setErrorMsg("");
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        const data = await response.json();
        if (data.erro) {
            setErrorMsg("CEP inválido.");
        } else {
            // Dica: Mantemos o endereço visualmente bonito, mas o cálculo usará o CEP
            setAddress(`${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`);
            setErrorMsg("");
            setTimeout(() => numberInputRef.current?.focus(), 100);
        }
    } catch (error) {
        setErrorMsg("Erro ao buscar CEP.");
    } finally {
        setLoadingCep(false);
    }
  };

  // --- NOVA LÓGICA DE CÁLCULO (CEP FIRST) ---
  const handleCalculateFromText = async () => {
    if (!address) {
        setErrorMsg("Preencha o endereço.");
        return;
    }
    setLoadingLoc(true);
    setErrorMsg("");

    try {
        let found = false;
        const cepClean = cep.replace(/\D/g, "");

        // ESTRATÉGIA 1: BUSCA DIRETA PELO CEP (A mais confiável)
        // O Nominatim acha o CEP muito mais fácil do que nomes de ruas com bairros
        if (cepClean.length === 8) {
            console.log("Tentando busca via CEP:", cepClean);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&postalcode=${cepClean}&country=Brazil&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                setUserLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
                found = true;
                setErrorMsg("");
                setLoadingLoc(false);
                return; // Encerra aqui se achou pelo CEP
            }
        }

        // ESTRATÉGIA 2: BUSCA POR TEXTO (Se não tiver CEP ou falhar)
        // Removemos vírgulas e tentamos focar em Rua + Cidade + Brasil
        if (!found) {
            console.log("Busca CEP falhou ou sem CEP. Tentando texto...");
            
            // Tenta limpar o endereço para pegar só a primeira parte (Rua) se tiver vírgula
            // Ex: "Rua A, Bairro B" vira "Rua A" para a busca
            const streetOnly = address.split(',')[0]; 
            
            // Busca: "Rua X, Número, Brazil"
            const query = `${streetOnly}, ${addressNumber}, Brazil`;
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                setUserLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
                found = true;
            } else {
                // Última tentativa: Só a Rua + Brazil (sem número)
                const queryFallback = `${streetOnly}, Brazil`;
                const resFallback = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryFallback)}&limit=1`);
                const dataFallback = await resFallback.json();

                if (dataFallback && dataFallback.length > 0) {
                    setUserLocation({ lat: parseFloat(dataFallback[0].lat), lng: parseFloat(dataFallback[0].lon) });
                    found = true;
                }
            }
        }

        if (found) {
            setErrorMsg("");
        } else {
            setErrorMsg("Localização não encontrada. Tente usar o botão 'Usar GPS'.");
            setUserLocation(null); 
        }

    } catch (error) {
        setErrorMsg("Erro de conexão com o mapa.");
    } finally {
        setLoadingLoc(false);
    }
  };

  const handleGetGPS = () => {
    setLoadingLoc(true);
    setErrorMsg("");
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
                    const data = await response.json();
                    if (data.address) {
                        setAddress(`${data.address.road || ''}, ${data.address.suburb || ''} - ${data.address.city || ''}`);
                        setCep(data.address.postcode || "");
                    } else {
                        setAddress("Localização GPS");
                    }
                } catch (e) { setAddress("Minha Localização"); }
                setLoadingLoc(false);
            },
            (error) => { setErrorMsg("Erro ao obter GPS (Permissão negada?)."); setLoadingLoc(false); }
        );
    } else { setErrorMsg("Navegador sem GPS."); setLoadingLoc(false); }
  };

  const handleFinish = (e: FormEvent) => {
    e.preventDefault();
    if (deliveryFee === 0 && items.length > 0) {
        if(!confirm("Taxa de entrega não calculada. Continuar?")) return;
    }
    const phone = "5511999999999"; 
    const totalWithFee = total + deliveryFee;
    let message = `*NOVO PEDIDO - WhatsMenu* 📋\n\n*Cliente:* ${name}\n*Endereço:* ${address}, ${addressNumber}\n`;
    if(cep) message += `*CEP:* ${cep}\n`;
    message += `*Pagamento:* ${paymentMethod.toUpperCase()}\n\n*ITENS:*\n`;
    items.forEach(item => {
        message += `• ${item.quantity}x ${item.name} (R$ ${item.price.toFixed(2)})\n`;
        if (item.observation) message += `   Obs: ${item.observation}\n`;
    });
    message += `\n*Taxa:* ${deliveryFee > 0 ? `R$ ${deliveryFee.toFixed(2)}` : 'A combinar'}`;
    message += `\n*Tempo:* ${deliveryTime} min`;
    message += `\n*TOTAL:* R$ ${totalWithFee.toFixed(2)}`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    clearCart();
    onOpenChange(false);
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 flex flex-col max-h-[90vh]">
        <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800">Finalizar Pedido</h3>
            <button type="button" onClick={() => onOpenChange(false)} className="p-2 bg-gray-200 rounded-full hover:bg-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleFinish} className="p-5 space-y-4 overflow-y-auto">
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Seu Nome</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full border p-3 rounded-lg bg-gray-50 outline-none focus:ring-2 focus:ring-green-500" placeholder="Ex: João Silva" />
            </div>
            <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <label className="block text-sm font-bold text-gray-700">Endereço de Entrega</label>
                <div className="relative">
                    <input value={cep} onChange={handleCepChange} onBlur={handleCepBlur} maxLength={9} className="w-full border p-3 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500" placeholder="CEP (00000-000)" />
                    {loadingCep && <Loader2 className="absolute right-3 top-3 animate-spin text-gray-400" size={20} />}
                </div>
                <div className="flex gap-2">
                    <input required value={address} onChange={e => setAddress(e.target.value)} className="flex-1 border p-3 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500 text-sm" placeholder="Rua, Bairro..." />
                    <input ref={numberInputRef} required value={addressNumber} onChange={e => setAddressNumber(e.target.value)} className="w-20 border p-3 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500 text-center" placeholder="Nº" />
                </div>
                <button type="button" onClick={handleCalculateFromText} disabled={loadingLoc || !address || !addressNumber} className="w-full bg-blue-100 text-blue-700 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-200 transition-colors">
                    {loadingLoc ? <Loader2 className="animate-spin" size={16}/> : <Search size={16} />} Confirmar & Calcular Frete
                </button>
                <button type="button" onClick={handleGetGPS} className="w-full text-xs text-gray-500 flex items-center justify-center gap-1 hover:text-gray-700 hover:underline mt-2"><MapPin size={12} /> Usar GPS (Local Atual)</button>
                {errorMsg && <p className="text-xs text-red-500 font-bold text-center bg-red-50 p-2 rounded">{errorMsg}</p>}
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border p-3 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-500">
                    <option value="pix">PIX</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao">Cartão na Entrega</option>
                </select>
            </div>
            <div className="bg-green-50 p-4 rounded-lg space-y-2 border border-green-100">
                <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>{formatMoney(total)}</span></div>
                <div className="flex justify-between text-sm text-gray-600">
                    <span className="flex items-center gap-1">Entrega</span>
                    <span className={deliveryFee > 0 ? "text-red-600 font-bold" : "text-orange-500 font-medium"}>{deliveryFee > 0 ? formatMoney(deliveryFee) : "A calcular"}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-green-700 pt-2 border-t border-green-200"><span>Total</span><span>{formatMoney(total + deliveryFee)}</span></div>
            </div>
            <button type="submit" className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-all active:scale-[0.98]">Enviar Pedido no WhatsApp 🟢</button>
        </form>
      </div>
    </div>
  );
}
