import { createClient } from '@supabase/supabase-js';

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env || {} : {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const testCreateClient = globalThis.__mockCreateClient;
const isSupabaseConfigured = Boolean((supabaseUrl && supabaseAnonKey) || testCreateClient);

const getCookieDomain = () => {
  if (typeof window === 'undefined') return '';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return '';
  if (hostname === 'geeksproductionstudio.com' || hostname.endsWith('.geeksproductionstudio.com')) return '.geeksproductionstudio.com';
  return '';
};

const getCookieOptions = () => {
  const domain = getCookieDomain();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  const domainPart = domain ? `; Domain=${domain}` : '';
  return `Path=/; SameSite=Lax${secure}${domainPart}`;
};

const cookieStorage = {
  getItem(key) {
    if (typeof document === 'undefined') return null;
    const cookies = document.cookie ? document.cookie.split('; ') : [];
    const cookie = cookies.find((item) => item.startsWith(`${key}=`));
    if (!cookie) return null;
    try {
      return decodeURIComponent(cookie.slice(key.length + 1));
    } catch (_error) {
      return cookie.slice(key.length + 1);
    }
  },
  setItem(key, value) {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${60 * 60 * 24 * 365}; ${getCookieOptions()}`;
  },
  removeItem(key) {
    if (typeof document === 'undefined') return;
    document.cookie = `${key}=; Max-Age=0; ${getCookieOptions()}`;
  }
};

export const supabase = isSupabaseConfigured
  ? (testCreateClient
      ? testCreateClient(supabaseUrl, supabaseAnonKey)
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            storage: cookieStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }))
  : null;

export async function getSupabaseUser() {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn('Supabase auth getUser failed.', error);
      return null;
    }
    return data?.user ?? null;
  } catch (error) {
    console.warn('Supabase auth unavailable.', error);
    return null;
  }
}

export function buildRealtimeChannelName(namespaceKey, sessionId, kind) {
  if (!namespaceKey || !sessionId || !kind) {
    return null;
  }
  return `mp:${namespaceKey}:${sessionId}:${kind}`;
}

export function createRealtimeChannel(namespaceKey, sessionId, kind, options = {}) {
  if (!supabase) {
    return null;
  }

  const channelName = buildRealtimeChannelName(namespaceKey, sessionId, kind);
  if (!channelName) {
    return null;
  }

  return supabase.channel(channelName, options);
}

export function isSupabaseReady() {
  return Boolean(supabase);
}
