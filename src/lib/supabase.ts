import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Keep the legacy variable as a local-development fallback while standardising
// deployments on Supabase's current publishable-key terminology.
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
