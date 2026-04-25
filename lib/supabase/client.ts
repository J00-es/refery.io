import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Use placeholder values during build/SSR to avoid crashing prerender.
  // At runtime in the browser, env vars are inlined at build time as long as they exist.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  return createBrowserClient(url, key)
}
