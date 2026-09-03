// Edge Function — roda no servidor da Supabase, nunca no navegador. Recebe o JWT
// do próprio usuário, confirma quem é chamando /auth/v1/user com a anon key, e só
// então usa a service_role (variável de ambiente da função, nunca exposta ao
// client) pra deletar a conta. Como toda tabela tem `user_id references
// auth.users(id) on delete cascade`, apagar o auth.users já apaga tudo em cascata.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Sem autenticação." }), { status: 401 });
  }

  // Cliente com a anon key + o JWT do chamador — só serve pra descobrir QUEM está pedindo.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
  }

  // Só aqui, no servidor, a service_role é usada — nunca chega no client.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
