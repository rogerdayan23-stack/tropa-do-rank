import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log de diagnóstico ao carregar o módulo
console.log("[SUPABASE] Inicializando cliente Supabase...");
console.log("[SUPABASE] NEXT_PUBLIC_SUPABASE_URL presente:", !!supabaseUrl);
if (supabaseUrl) console.log("[SUPABASE] URL completa:", supabaseUrl);
console.log("[SUPABASE] NEXT_PUBLIC_SUPABASE_ANON_KEY presente:", !!supabaseAnonKey);
console.log("[SUPABASE] SUPABASE_SERVICE_ROLE_KEY presente:", !!supabaseServiceKey);
if (supabaseServiceKey) console.log("[SUPABASE] Service Key completo:", supabaseServiceKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias");
}

export function createClient() {
  const cookieStore = cookies();
  return createSupabaseClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
  });
}

export function createServiceClient() {
  if (!supabaseServiceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY é obrigatória para operações de admin");
  }
  // O service client NÃO usa cookies — ele autentica via service role key
  return createSupabaseClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { supabaseUrl, supabaseAnonKey };

// Teste de conectividade com o Supabase (executa uma vez ao carregar)
if (typeof process !== "undefined" && supabaseUrl) {
  (async () => {
    try {
      console.log("[SUPABASE-TEST] Testando conectividade com:", supabaseUrl);
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: supabaseAnonKey!,
          Authorization: `Bearer ${supabaseAnonKey!}`,
        },
      });
      console.log("[SUPABASE-TEST] Status da resposta:", res.status);
      const text = await res.text();
      console.log("[SUPABASE-TEST] Corpo da resposta:", text.substring(0, 200));
    } catch (err: any) {
      console.error("[SUPABASE-TEST] FALHA na conectividade:", err.message);
      console.error("[SUPABASE-TEST] Verifique se o projeto do Supabase está ativo e a URL está correta");
    }
  })();
}
