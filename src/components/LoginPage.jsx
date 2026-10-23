import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { LanguageProvider, TranslatedText } from '../contexts/LanguageContext.jsx';
import LanguageSwitcher from './LanguageSwitcher.jsx';

const getSafeRedirectPath = () => {
  if (typeof window === 'undefined') return '/';
  const params = new URLSearchParams(window.location.search);
  const redirectTo = params.get('redirect_to') || '/';

  try {
    const url = new URL(redirectTo, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch (_error) {
    return '/';
  }
};

const LoginPage = () => {
  const { authAvailable, loading, session, signInWithPassword, signInWithSSO } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const redirectPath = useMemo(() => getSafeRedirectPath(), []);

  useEffect(() => {
    if (!loading && session && typeof window !== 'undefined') {
      window.location.assign(redirectPath);
    }
  }, [loading, redirectPath, session]);

  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: authError } = await signInWithPassword(email.trim(), password);
    setSubmitting(false);

    if (authError) {
      setError(authError.message || 'Login failed.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.assign(redirectPath);
    }
  };

  const handleSsoLogin = async () => {
    setError('');
    setSubmitting(true);
    const nextLoginPath = `/login?redirect_to=${encodeURIComponent(redirectPath)}`;
    const { error: authError } = await signInWithSSO({ redirectTo: nextLoginPath });
    setSubmitting(false);

    if (authError) {
      setError(authError.message || 'SSO login failed.');
    }
  };

  return (
    <LanguageProvider>
      <div className="App">
        <LanguageSwitcher style={{ position: 'absolute', top: '20px', right: '20px' }} />
        <main className="app-main" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <section style={{ width: 'min(460px, 100%)', background: '#111827', border: '1px solid #374151', borderRadius: '14px', padding: '24px', color: '#f9fafb', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <h1 style={{ marginTop: 0, marginBottom: '8px' }}><TranslatedText>GeeksProductionStudio Login</TranslatedText></h1>
            <p style={{ color: '#9ca3af', marginTop: 0, marginBottom: '20px' }}><TranslatedText>Sign in to unlock cloud saves and online route providers. Offline simulation remains available without login.</TranslatedText></p>

            {!authAvailable && (
              <div style={{ background: '#451a1a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fecaca' }}><TranslatedText>Supabase authentication is not configured for this build.</TranslatedText></div>
            )}

            {error && (
              <div style={{ background: '#451a1a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fecaca' }}>
                {error}
              </div>
            )}

            <form onSubmit={handlePasswordLogin} style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span><TranslatedText>Email</TranslatedText></span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!authAvailable || loading || submitting}
                  required
                  style={{ padding: '12px', borderRadius: '8px', border: '1px solid #4b5563', background: '#030712', color: '#f9fafb' }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px' }}>
                <span><TranslatedText>Password</TranslatedText></span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={!authAvailable || loading || submitting}
                  required
                  style={{ padding: '12px', borderRadius: '8px', border: '1px solid #4b5563', background: '#030712', color: '#f9fafb' }}
                />
              </label>

              <button type="submit" disabled={!authAvailable || loading || submitting} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: authAvailable ? 'pointer' : 'not-allowed' }}>
                <TranslatedText>{submitting ? 'Signing in...' : 'Sign In'}</TranslatedText>
              </button>
            </form>

            <button onClick={handleSsoLogin} disabled={!authAvailable || loading || submitting} style={{ width: '100%', marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #4b5563', background: '#1f2937', color: '#f9fafb', fontWeight: 700, cursor: authAvailable ? 'pointer' : 'not-allowed' }}><TranslatedText>Continue with Google SSO</TranslatedText></button>

            <button onClick={() => window.location.assign('/')} style={{ width: '100%', marginTop: '12px', padding: '10px', borderRadius: '8px', border: 'none', background: 'transparent', color: '#93c5fd', cursor: 'pointer' }}><TranslatedText>Continue offline</TranslatedText></button>
          </section>
        </main>
      </div>
    </LanguageProvider>
  );
};

export default LoginPage;
