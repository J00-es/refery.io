export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function requireSharedSecret(req: Request, envName: string): void {
  const expected = Deno.env.get(envName);
  const url = new URL(req.url);
  const provided = req.headers.get("x-refery-brain-secret") ?? url.searchParams.get("token") ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) throw new Error("Unauthorized");
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const status = message === "Unauthorized" ? 401 : 500;
  console.error(JSON.stringify({ level: "error", message }));
  return json({ ok: false, error: status === 401 ? "Unauthorized" : "Internal error" }, status);
}


