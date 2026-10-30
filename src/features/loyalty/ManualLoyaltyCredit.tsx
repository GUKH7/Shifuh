"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, ShieldAlert } from "lucide-react";
import { getCurrentRestaurant } from "@/lib/supabase/restaurant";
import { calculateManualPoints, validateManualCredit, type CreditMode, type EarningConfig } from "./manual-credit";

type Customer = { id: string; phone: string | null };
type Account = { customer_id: string; points_balance: number };

export default function ManualLoyaltyCredit() {
  const router = useRouter();
  const client = useMemo(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Account[]>([]);
  const [program, setProgram] = useState<EarningConfig | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [mode, setMode] = useState<CreditMode>("spend");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Compra presencial");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [requestId, setRequestId] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { restaurant, user, error: membershipError } = await getCurrentRestaurant(client);
      if (!user) { router.replace("/admin/login"); return; }
      if (membershipError || !restaurant) throw new Error("Não foi possível confirmar o restaurante.");
      const [customersResult, balancesResult, programResult] = await Promise.all([
        client.from("customers").select("id,phone").eq("restaurant_id",restaurant.id).order("created_at",{ascending:false}).limit(200),
        client.from("loyalty_accounts").select("customer_id,points_balance").eq("restaurant_id",restaurant.id).limit(200),
        client.from("loyalty_programs").select("status,earning_mode,spend_amount,points_per_spend,points_per_order,minimum_order_amount").eq("restaurant_id",restaurant.id).maybeSingle(),
      ]);
      if (customersResult.error || balancesResult.error || programResult.error) throw new Error("Falha ao consultar clientes e fidelidade.");
      setCustomers((customersResult.data ?? []) as Customer[]);
      setBalances((balancesResult.data ?? []) as Account[]);
      setProgram(programResult.data as EarningConfig | null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar clientes.");
    } finally { setLoading(false); }
  }, [client,router]);
  useEffect(() => { void reload(); }, [reload]);
  const selected = customers.find(c => c.id === customerId);
  const balance = balances.find(a => a.customer_id === customerId)?.points_balance ?? 0;
  let points = 0; let validationError = "";
  try {
    if (!program) throw new Error("Configure o programa de fidelidade.");
    points = calculateManualPoints(mode,amount,program);
    if (!customerId) throw new Error("Selecione um cliente.");
    // Validation only. This request key must be persisted across retries when the API is implemented.
    if (confirmation) validateManualCredit({customerId,requestId,reason,points});
    else if (reason.trim().length < 5) throw new Error("Informe o motivo do crédito.");
  } catch (cause) { validationError = cause instanceof Error ? cause.message : "Dados inválidos."; }

  return <section className="surface-card space-y-4 rounded-3xl p-4 sm:p-6" aria-labelledby="manual-credit-title">
    <div className="flex items-start gap-3">
      <span className="rounded-2xl bg-orange-50 p-3 text-[var(--brand)]"><Coins size={21}/></span>
      <div><h2 id="manual-credit-title" className="text-xl font-black text-gray-950">Crédito por compra presencial</h2>
        <p className="mt-1 text-sm text-gray-600">Prepare o lançamento de pontos para clientes que compraram diretamente no restaurante.</p></div>
    </div>
    {loading ? <p role="status" className="text-sm text-gray-600">Carregando clientes...</p> : error ? <div role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={() => void reload()} className="ml-3 underline">Tentar novamente</button></div> : <>
      {customers.length === 0 ? <p role="status" className="rounded-2xl bg-gray-50 p-4 text-sm">Ainda não há clientes cadastrados nesta loja.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-bold text-gray-700">Cliente
          <select value={customerId} onChange={event=>{setCustomerId(event.target.value);setConfirmation(false);}} className="min-h-12 w-full rounded-2xl border border-[var(--line)] bg-white px-3 text-base">
            <option value="">Selecione o cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.phone || "Cliente sem telefone"} — {c.id.slice(0,8)}</option>)}
          </select>
        </label>
        <div className="rounded-2xl bg-orange-50 p-3"><p className="text-xs font-bold text-gray-600">Saldo atual</p><p className="text-xl font-black">{balance} pontos</p></div>
      </div>
      <div role="group" aria-label="Forma de calcular os pontos" className="flex flex-col gap-2 sm:flex-row">
        <button type="button" aria-pressed={mode==="spend"} onClick={()=>{setMode("spend");setConfirmation(false);}} className={`min-h-11 flex-1 rounded-xl border px-4 text-sm font-bold ${mode==="spend"?"border-[var(--brand)] bg-orange-50":"border-[var(--line)]"}`}>Valor da compra</button>
        <button type="button" aria-pressed={mode==="points"} onClick={()=>{setMode("points");setConfirmation(false);}} className={`min-h-11 flex-1 rounded-xl border px-4 text-sm font-bold ${mode==="points"?"border-[var(--brand)] bg-orange-50":"border-[var(--line)]"}`}>Pontos diretos</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-bold text-gray-700">{mode==="spend"?"Valor da compra (R$)":"Quantidade de pontos"}
          <input inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);setConfirmation(false);}} placeholder={mode==="spend"?"35,00":"35"} className="min-h-12 w-full rounded-2xl border border-[var(--line)] px-3 text-base"/>
        </label>
        <label className="space-y-1 text-sm font-bold text-gray-700">Motivo
          <input value={reason} maxLength={200} onChange={event=>{setReason(event.target.value);setConfirmation(false);}} className="min-h-12 w-full rounded-2xl border border-[var(--line)] px-3 text-base"/>
        </label>
      </div>
      <div className="rounded-2xl bg-gray-50 p-4" aria-live="polite"><p className="text-xs font-bold text-gray-500">Simulação do crédito</p>
        <p className="text-2xl font-black text-gray-950">+{points} pontos</p>
        {validationError && amount ? <p className="mt-2 text-xs text-amber-800">{validationError}</p> : null}
      </div>
      {!confirmation ? <button type="button" disabled={!!validationError || !selected} onClick={()=>{setRequestId(crypto.randomUUID());setConfirmation(true);}} className="min-h-12 w-full rounded-2xl bg-[var(--brand)] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Revisar crédito</button> :
        <div role="status" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold">Confirmação: {selected?.phone ?? "Cliente"} receberia {points} pontos por {reason.trim()}.</p>
          <p className="text-sm text-amber-900">Crédito ainda não habilitado: falta validar a operação atômica com histórico e proteção contra duplicações no servidor.</p>
          <button type="button" onClick={()=>setConfirmation(false)} className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold">Voltar e editar</button>
        </div>}
    </>}
    <p className="flex items-start gap-2 text-xs leading-5 text-gray-500"><ShieldAlert size={16} className="shrink-0"/> Prévia somente leitura. Nenhum ponto será creditado até o backend transacional ser implementado e homologado.</p>
  </section>;
}
