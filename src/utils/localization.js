import en from '../locales/en.js';
import zh from '../locales/zh.js';
import uiTextZh from '../locales/uiTextZh.js';

export const LANGUAGE_STORAGE_KEY = 'aviation-intercept-language';

export function readLanguage(storage) {
  try {
    return storage?.getItem(LANGUAGE_STORAGE_KEY) === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function interpolate(value, params = {}) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{(\w+)\}/g, (match, param) => (
    params[param] !== undefined ? params[param] : match
  ));
}

export function translate(language, key, params = {}) {
  if (!key || typeof key !== 'string') return key || '';
  const lookup = (catalog) => key.split('.').reduce((value, part) => (
    value && Object.hasOwn(value, part) ? value[part] : undefined
  ), catalog);
  return interpolate(lookup(language === 'zh' ? zh : en) ?? lookup(en) ?? key, params);
}

export function translateText(language, text, params = {}) {
  if (typeof text !== 'string') return text ?? '';
  if (language !== 'zh' && params.count === 1) text = text.replace(/lessons$/, 'lesson').replace(/challenges$/, 'challenge');
  if (language !== 'zh' && params.minutes === 1) text = text.replace(/minutes$/, 'minute');
  return interpolate(language === 'zh' && Object.hasOwn(uiTextZh, text) ? uiTextZh[text] : text, params);
}
