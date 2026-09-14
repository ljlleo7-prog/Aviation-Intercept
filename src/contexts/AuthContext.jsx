import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/aviationIntercept/SupabaseClient.js';

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  authAvailable: false,
  signInWithPassword: async () => ({ error: new Error('Authentication is not configured.') }),
  signInWithSSO: async () => ({ error: new Error('Authentication is not configured.') }),
  signOut: async () => ({ error: null })
});

const getRedirectUrl = (path = '/') => {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const authAvailable = Boolean(supabase?.auth);

  useEffect(() => {
    if (!authAvailable) {
      setLoading(false);
      setSession(null);
      setUser(null);
      return undefined;
    }

    let isMounted = true;

    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (error) {
        setSession(null);
        setUser(null);
      } else {
        setSession(data?.session ?? null);
        setUser(data?.session?.user ?? null);
      }
      setLoading(false);
    };

    syncSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe?.();
    };
  }, [authAvailable]);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    authAvailable,
    signInWithPassword: async (email, password) => {
      if (!authAvailable) {
        return { error: new Error('Authentication is not configured.') };
      }
      return supabase.auth.signInWithPassword({ email, password });
    },
    signInWithSSO: async ({ redirectTo = '/' } = {}) => {
      if (!authAvailable) {
        return { error: new Error('Authentication is not configured.') };
      }
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(redirectTo)
        }
      });
    },
    signOut: async () => {
      if (!authAvailable) {
        return { error: null };
      }
      return supabase.auth.signOut();
    }
  }), [authAvailable, loading, session, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
