import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Prefer the modern publishable key. Keep the anon variable as a local-development
// compatibility fallback; never use a service-role or secret key in this browser app.
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
