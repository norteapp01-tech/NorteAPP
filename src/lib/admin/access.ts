import { useEffect, useState } from "react";
import { supabase, useSupabaseUserId } from "@/lib/supabase/client";

export type AdminRole =
  "owner" | "financeiro" | "sucesso_cliente" | "marketing" | "produto" | "engenharia" | "auditor";

/** Checa admin_memberships pro usuário atual. A tabela é protegida por RLS
 * (`is_admin()`) — quem não é admin recebe lista vazia, nunca erro; não há
 * como um usuário comum "adivinhar" se é admin lendo a resposta. */
export function useIsAdmin(): { isAdmin: boolean; role: AdminRole | null; loading: boolean } {
  const userId = useSupabaseUserId();
  const [state, setState] = useState<{ role: AdminRole | null; loading: boolean }>({
    role: null,
    loading: true,
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("admin_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ role: (data?.role as AdminRole) ?? null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { isAdmin: !!state.role, role: state.role, loading: state.loading };
}
