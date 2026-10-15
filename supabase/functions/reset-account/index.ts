import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { removeUserFiles } from "../_shared/account-storage.ts";
import { accountCors } from "../_shared/account-cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = accountCors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return Response.json({ error: "Sem autenticação." }, { status: 401, headers: cors });

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error: authError } = await caller.auth.getUser();
  if (authError || !data.user)
    return Response.json({ error: "Sessão inválida." }, { status: 401, headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await removeUserFiles(admin, data.user.id);
    const { error: resetError } = await caller.rpc("reset_my_account_content");
    if (resetError) throw resetError;
    return Response.json({ ok: true }, { headers: cors });
  } catch {
    return Response.json(
      { error: "Não foi possível concluir o reset. Tente novamente." },
      { status: 500, headers: cors },
    );
  }
});
