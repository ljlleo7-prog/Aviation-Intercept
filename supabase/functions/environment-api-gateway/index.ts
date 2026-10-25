import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { createEnvironmentGateway } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const rpc = async (name: string, args: Record<string, unknown>) => {
  if (!admin) throw new Error('Gateway is not configured.');
  const { data, error } = await admin.rpc(name, args);
  if (error) throw error;
  return data;
};

serve(createEnvironmentGateway({
  authenticate: async (req: Request) => {
    if (!admin) throw new Error('Gateway is not configured.');
    const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user;
  },
  identifyGuest: async (req: Request) => {
    // Hosted ingress must supply/overwrite these headers. Missing identity fails closed.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip')
      || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (!ip || !key) return null;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}:guest-weather:${ip}`));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  },
  reserveGuest: (guestKey: string, requestId: string, requestKey: string) => rpc('reserve_guest_weather_api_call', {
    p_guest_key: guestKey, p_request_id: requestId, p_request_key: requestKey
  }),
  completeGuest: (guestKey: string, requestId: string, requestKey: string, result: { status: string; data: unknown; upstreamStatus: number; retryAfterSeconds: number }) => rpc('complete_guest_weather_api_call', {
    p_guest_key: guestKey, p_request_id: requestId, p_request_key: requestKey,
    p_status: result.status, p_data: result.data, p_retry_after_seconds: result.retryAfterSeconds
  }),
  reserve: (userId: string, requestId: string, requestKey: string, request: { provider: string; operation: string; locations: unknown[] }) => rpc('reserve_environment_api_call', {
    p_user_id: userId, p_request_id: requestId, p_request_key: requestKey,
    p_provider: request.provider, p_operation: request.operation, p_units: request.locations.length
  }),
  complete: (userId: string, requestId: string, result: { status: string; data: unknown; upstreamStatus: number; retryAfterSeconds: number }) => rpc('complete_environment_api_call', {
    p_user_id: userId, p_request_id: requestId, p_status: result.status,
    p_data: result.data, p_upstream_status: result.upstreamStatus, p_retry_after_seconds: result.retryAfterSeconds
  })
}));
