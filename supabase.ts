import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 🔍 Add these two temporary lines right here:
console.log("DEBUG - URL exists:", !!supabaseUrl);
console.log("DEBUG - Key exists:", !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);