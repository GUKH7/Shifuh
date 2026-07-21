"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function getToastIcon(tone: ToastTone) {
  if (tone === "success") return <CheckCircle2 size={18} className="text-emerald-600" />;
  if (tone === "error") return <AlertCircle size={18} className="text-red-600" />;
  return <Info size={18} className="text-sky-600" />;
}

function getToastToneClasses(tone: ToastTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50";
  if (tone === "error") return "border-red-200 bg-red-50";
  return "border-sky-200 bg-sky-50";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timeout = timeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description, tone = "info" }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: ToastItem = { id, title, description, tone };

      setToasts((current) => [...current, toast]);
      const timeout = setTimeout(() => removeToast(id), 3600);
      timeouts.current.set(id, timeout);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-3 right-3 top-3 z-[100] flex w-auto max-w-sm flex-col gap-3 sm:left-auto sm:right-4 sm:top-4 sm:w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_18px_45px_rgba(17,16,15,0.12)] toast-enter ${getToastToneClasses(
              toast.tone,
            )}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getToastIcon(toast.tone)}</div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-950">{toast.title}</p>
                {toast.description && (
                  <p className="mt-1 text-sm leading-6 text-gray-600">{toast.description}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="rounded-full p-1 text-gray-400 hover:bg-white/60 hover:text-gray-700"
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
