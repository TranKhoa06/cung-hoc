import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const cloudConfigured = !!url && !!key;
export const supabase = cloudConfigured ? createClient(url!, key!, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) : null;
export async function signInWithGoogle() {
  if (!supabase) throw new Error('Chưa cấu hình Supabase. Xem hướng dẫn kết nối trong README.');
  const redirectTo = `${location.origin}${location.pathname}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}
