import { createClient } from "npm:@supabase/supabase-js@2.95.0";

function getAdminKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) throw new Error("Missing SUPABASE service secret");
  const parsed = JSON.parse(raw);
  const key = parsed.default ?? Object.values(parsed)[0];
  if (typeof key !== "string") throw new Error("No usable SUPABASE secret key");
  return key;
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("Missing SUPABASE_URL");
  return createClient(url, getAdminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function one<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Expected one database row");
  return data;
}


