import PropTypes from 'prop-types';
import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { LANGUAGE_STORAGE_KEY, readLanguage, translate, translateText } from '../utils/localization.js';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, updateLanguage] = useState(() => {
    try {
      return readLanguage(window.localStorage);
    } catch {
      return 'en';
    }
  });
  const setLanguage = (next) => updateLanguage(previous => {
    const value = typeof next === 'function' ? next(previous) : next;
    return value === 'zh' ? 'zh' : 'en';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language switching still works when storage is unavailable.
    }
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const toggleLanguage = () => setLanguage(previous => previous === 'en' ? 'zh' : 'en');
  const t = useCallback((key, params) => translate(language, key, params), [language]);
  const tx = useCallback((text, params) => translateText(language, text, params), [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t, tx }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};

export const TranslatedText = ({ children }) => {
  const { tx } = useLanguage();
  return tx(children);
};

LanguageProvider.propTypes = { children: PropTypes.node };
TranslatedText.propTypes = { children: PropTypes.string };
