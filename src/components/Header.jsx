import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext.jsx';

const Header = ({ devMode, setDevMode, handleDevStart }) => {
  const { t, tx } = useLanguage();
  const { user, authAvailable, signOut, signInWithSSO } = useAuth();

  const handleLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/login?redirect_to=/');
    }
  };

  const handleQuickSso = async () => {
    const { error } = await signInWithSSO({ redirectTo: '/login?redirect_to=/' });
    if (error) {
      console.warn('SSO sign-in failed.', error);
    }
  };

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  return (
    <header className="app-header">
      <h1>{t('initialization.title')}</h1>
      <p>{t('initialization.subtitle')}</p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
        {user ? (
          <>
            <span style={{ color: '#cbd5e1', alignSelf: 'center' }}>{user.email}</span>
            <button onClick={handleLogout} style={{ backgroundColor: '#334155', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
              {tx("Sign Out")}
            </button>
          </>
        ) : (
          <>
            <button onClick={handleLogin} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
              {tx("Login")}
            </button>
            {authAvailable && (
              <button onClick={handleQuickSso} style={{ backgroundColor: '#1f2937', color: 'white', border: '1px solid #475569', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                {tx("SSO Sign in")}
              </button>
            )}
          </>
        )}
      </div>

      {/* Development mode toggle */}
      <div className="dev-mode-toggle" style={{ marginTop: '10px' }}>
        <button
          onClick={() => setDevMode(!devMode)}
          style={{
            backgroundColor: devMode ? '#ff6b6b' : '#4ecdc4',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {devMode ? tx('🔧 Dev Mode: ON') : tx('🔧 Dev Mode: OFF')}
        </button>
      </div>

      {/* Development mode quick start button */}
      {devMode && (
        <div className="dev-start" style={{ marginTop: '10px' }}>
          <button
            onClick={handleDevStart}
            style={{
              backgroundColor: '#ff4757',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {tx("\ud83d\ude80 Quick Start Physics Test")}
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;
