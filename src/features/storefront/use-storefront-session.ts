"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type StorefrontSessionOptions = {
  supabase: SupabaseClient<any>;
  onCustomerLoaded?: (profile: { name: string; phone: string }) => void;
};

export function useStorefrontSession({
  supabase,
  onCustomerLoaded,
}: StorefrontSessionOptions) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        try {
          const response = await fetch("/api/customer/profile", {
            credentials: "same-origin",
          });
          const payload = await response.json();
          if (!mounted || !payload?.customer) return;

          onCustomerLoaded?.(payload.customer);
          setSavedAddresses(Array.isArray(payload.addresses) ? payload.addresses : []);
        } catch {
          // O checkout continua disponível mesmo sem os dados lembrados do cliente.
        }
        return;
      }

      setCurrentUser(user);

      const [{ data: profile }, { data: addresses }] = await Promise.all([
        supabase.from("profiles").select("name, phone").eq("id", user.id).maybeSingle(),
        supabase
          .from("customer_addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      ]);

      if (!mounted) return;

      if (profile) {
        onCustomerLoaded?.({
          name: profile.name || "",
          phone: profile.phone || "",
        });
      }

      setSavedAddresses(addresses || []);
    };

    loadSession();

    return () => {
      mounted = false;
    };
  }, [onCustomerLoaded, supabase]);

  return { currentUser, savedAddresses };
}
