import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/locales/en.js';
import zh from '../src/locales/zh.js';
import uiTextZh from '../src/locales/uiTextZh.js';
import { TUTORIALS, TUTORIAL_CATEGORIES } from '../src/data/tutorialCatalog.js';
import { CHALLENGES, CHALLENGE_CATEGORIES } from '../src/data/challengeCatalog.js';
import { readLanguage, translate, translateText } from '../src/utils/localization.js';

const placeholders = text => [...text.matchAll(/\$\{([^}]+)\}/g)].map(match => match[1]).sort();
const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, entry]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return typeof entry === 'string' ? [[path, entry]] : flatten(entry, path);
});

test('Chinese catalog covers English keys and preserves interpolation parameters', () => {
  const english = Object.fromEntries(flatten(en));
  const chinese = Object.fromEntries(flatten(zh));
  assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort());
  for (const [key, text] of Object.entries(english)) {
    assert.ok(chinese[key].trim(), key);
    assert.deepEqual(placeholders(chinese[key]), placeholders(text), key);
  }
  for (const [source, text] of Object.entries(uiTextZh)) {
    assert.ok(text.trim(), source);
    assert.deepEqual(placeholders(text), placeholders(source), source);
  }
});

test('all tutorial and challenge catalog display fields have Chinese translations', () => {
  for (const entry of [...TUTORIAL_CATEGORIES, ...CHALLENGE_CATEGORIES, ...TUTORIALS, ...CHALLENGES]) {
    for (const text of [entry.label, entry.description, entry.title, entry.summary, entry.difficulty, entry.duration, ...(entry.topics || [])].filter(Boolean)) {
      assert.ok(Object.hasOwn(uiTextZh, text), `Missing Chinese: ${text}`);
      assert.match(translateText('zh', text), /[\u3400-\u9fff]/, text);
      assert.equal(translateText('en', text), text);
    }
  }
});

test('flight and system labels honor Chinese language selection', () => {
  assert.equal(translate('zh', 'ui.flight.altitude'), '高度');
  assert.equal(translate('zh', 'ui.systems.engines'), '发动机');
  assert.equal(translate('en', 'ui.systems.engines'), 'Engines');
  assert.equal(translate('zh', 'ui.crash.final_score', { score: 0 }), '最终得分: 0');
});

test('text translation handles counts, missing values, fallback and switching', () => {
  assert.equal(translateText('zh', '${count} lessons', { count: 2 }), '2 节课程');
  assert.equal(translateText('en', '${count} lessons', { count: 1 }), '1 lesson');
  assert.equal(translateText('en', 'Every ${minutes} minutes', { minutes: 1 }), 'Every 1 minute');
  assert.equal(translateText('zh', 'Unknown new feature'), 'Unknown new feature');
  assert.equal(translate('zh', 'missing.key'), 'missing.key');
  assert.equal(translateText('zh', undefined), '');
  assert.equal(translateText('zh', 'Step ${current} / ${total}', { current: 1 }), '第 1 / ${total} 步');
  assert.equal(translateText('zh', 'Settings'), '设置');
  assert.equal(translateText('en', 'Settings'), 'Settings');
});

test('language preference restores Chinese and tolerates unavailable storage', () => {
  assert.equal(readLanguage({ getItem: () => 'zh' }), 'zh');
  assert.equal(readLanguage({ getItem: () => 'invalid' }), 'en');
  assert.equal(readLanguage({ getItem() { throw new Error('Storage blocked'); } }), 'en');
  assert.equal(readLanguage(undefined), 'en');
});

test('recovery, FD, approach and terrain messages all have Chinese translations', () => {
  for (const text of ['RECOVER FLIGHT', 'Recover flight', 'Resume flight', 'Import flight save',
    'Cloud recovery requires a signed-in account. Save files also work offline.',
    'Saved aircraft position is invalid.', 'Flight director', 'ILS approach guidance',
    'Flight director pitch and roll commands', 'Waiting for aircraft position…', 'Terrain view',
    'APP runway reference', 'Use as APP reference', 'No approach runway selected',
    'NAV1 frequency does not match', 'Tune NAV1', 'NAV1 tuned · APP ready']) {
    assert.notEqual(translateText('zh', text), text);
  }
});
