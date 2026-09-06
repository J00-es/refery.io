import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

export async function googleRefreshToken(db: SupabaseClient): Promise<string> {
  const { data } = await db.rpc("brain_get_google_refresh_token");
  if (typeof data === "string" && data) return data;
  const fallback = Deno.env.get("GMAIL_REFRESH_TOKEN");
  if (!fallback) throw new Error("Google Drive authorization is not connected yet");
  return fallback;
}

export async function googleAccessToken(db: SupabaseClient): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const fixed = Deno.env.get("GMAIL_ACCESS_TOKEN");
  if (fixed) return fixed;
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Missing Google OAuth client secrets");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: await googleRefreshToken(db),
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`Google token refresh failed: ${JSON.stringify(payload).slice(0, 400)}`);
  cachedAccessToken = {
    value: String(payload.access_token),
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in ?? 3600)) * 1000,
  };
  return cachedAccessToken.value;
}

export function clearGoogleAccessTokenCache(): void {
  cachedAccessToken = null;
}

