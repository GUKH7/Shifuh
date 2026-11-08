"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Plus, UserRoundPlus, X } from "lucide-react";
import type { ManualCreditCustomer } from "./manual-credit-customers";

type RegistrationResult = {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string;
  was_existing: boolean;
};

type Props = {
  disabled?: boolean;
  onRegistered: (customer: ManualCreditCustomer) => void;
};

function normalizeBrazilMobile(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? digits : null;
}

export default function QuickCustomerRegistration({ disabled = false, onRegistered }: Props) {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || disabled) return;
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanPhone = normalizeBrazilMobile(phone);
    if (cleanName.length < 2 || cleanName.length > 100) {
      setError("Informe o nome do cliente (2 a 100 caracteres).");
      return;
    }
    if (!cleanPhone) {
      setError("Informe um celular brasileiro com DDD.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      // A operação é autorizada e vinculada ao restaurante pelo banco.
      // Não faz crédito de pontos: o operador confirma em etapa separada.
      const { data, error: rpcError } = await supabase.rpc("register_manual_loyalty_customer", {
        p_name: cleanName,
        p_phone: cleanPhone,
      });
      if (rpcError) throw rpcError;
      const result = (Array.isArray(data) ? data[0] : data) as RegistrationResult | null;
      if (!result?.customer_id || !result.customer_phone) {
        throw new Error("O cadastro não foi confirmado. Verifique e tente novamente.");
      }
      onRegistered({ id: result.customer_id, name: result.customer_name, phone: result.customer_phone });
      setInfo(result.was_existing
        ? "Este telefone já estava cadastrado. Cliente existente selecionado."
        : "Cliente cadastrado e selecionado. Agora informe os pontos.");
      setName("");
      setPhone("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cadastrar o cliente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {!open ? (
        <button type="button" disabled={disabled} onClick={() => { setOpen(true); setInfo(""); setError(""); }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-orange-300 bg-orange-50 px-4 text-sm font-black text-orange-800 transition-colors hover:bg-orange-100 disabled:opacity-50">
          <UserRoundPlus size={19} aria-hidden="true" /> Novo cliente presencial <Plus size={15} aria-hidden="true" />
        </button>
      ) : (
        <form onSubmit={submit} aria-label="Cadastrar cliente presencial"
          className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-gray-950">Novo cliente presencial</h3>
            <button type="button" aria-label="Fechar cadastro" disabled={busy}
              onClick={() => { setOpen(false); setError(""); }}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-white">
              <X size={18} />
            </button>
          </div>
          <label className="block space-y-1 text-sm font-bold text-gray-800">
            <span className="block">Nome</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              autoComplete="name" maxLength={100} required disabled={busy}
              placeholder="Ex.: Maria Silva"
              className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base outline-none focus-visible:border-orange-400" />
          </label>
          <label className="block space-y-1 text-sm font-bold text-gray-800">
            <span className="block">Celular com DDD</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              autoComplete="tel" inputMode="tel" required disabled={busy}
              placeholder="(11) 99999-9999"
              className="min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base outline-none focus-visible:border-orange-400" />
          </label>
          <p className="text-xs text-gray-600">Use o telefone informado pelo cliente para o programa de fidelidade. Se já existir, o cadastro será reutilizado.</p>
          {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={busy || disabled}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-black text-white disabled:opacity-50">
            {busy ? "Salvando..." : "Cadastrar e selecionar"}
          </button>
        </form>
      )}
      {info && !open ? <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />{info}
      </p> : null}
    </div>
  );
}
