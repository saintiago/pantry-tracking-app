import {
  date,
  deviceKey,
  getLanguage,
  message,
  number,
  readDevice,
  setLanguage,
  supportedLanguage,
  systemLanguage,
  t,
  writeDevice,
} from '../i18n';
import { messages } from '../messages';
import { getUnitLabel, localizedUnits } from '../../types/units';
import { parseFractionalQuantity } from '../../utils/quantity';

afterEach(() => {
  setLanguage('en');
  localStorage.clear();
  jest.restoreAllMocks();
});

test('detects the first supported browser preference and falls back to English', () => {
  expect(systemLanguage(['fr-FR', 'es-MX', 'it'])).toBe('es');
  expect(systemLanguage(['it-IT', 'en-US'])).toBe('it');
  expect(systemLanguage(['de-DE'])).toBe('en');
  expect(systemLanguage([])).toBe('en');
  expect(supportedLanguage('ES-es')).toBe('es');
  expect(supportedLanguage('english')).toBeUndefined();
});

test('keeps preferences isolated per account and tolerates invalid or unavailable storage', () => {
  writeDevice({ language: 'es', source: 'explicit' }, 'alice');
  writeDevice({ language: 'it', source: 'account' }, 'bob');
  expect(readDevice('alice')?.language).toBe('es');
  expect(readDevice('bob')?.language).toBe('it');
  expect(readDevice()).toBeUndefined();
  localStorage.setItem(deviceKey('alice'), '{broken');
  expect(readDevice('alice')).toBeUndefined();
  localStorage.setItem(deviceKey('alice'), JSON.stringify({ language: 'de', source: 'explicit' }));
  expect(readDevice('alice')).toBeUndefined();
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(writeDevice({ language: 'es', source: 'explicit' })).toBe(false);
});

test('translates app messages while preserving interpolated user content and braces', () => {
  setLanguage('es');
  expect(t('Remove {0}', 'Recipes {1}')).toBe('Eliminar Recipes {1}');
  expect(
    message('Recipe unavailable: My Recipes (r1). Its ingredients could not be calculated.'),
  ).toBe('Receta no disponible: My Recipes (r1). No se pudieron calcular sus ingredientes.');
  expect(message('An unknown original error')).toBe('An unknown original error');
  expect(t(' after planned meals.')).toBe(' tras las comidas planificadas.');
  expect(document.documentElement.lang).toBe('es');
  setLanguage('it');
  expect(getLanguage()).toBe('it');
  expect(message('Failed to load recipes')).toBe('Impossibile caricare le ricette');
});

test('formats quantities, dates and units in the selected language without changing unit keys', () => {
  setLanguage('it');
  expect(number(1.75)).toBe('1,75');
  expect(date('2028-02-03')).toBe('03/02/2028');
  expect(getUnitLabel('piece', 1)).toBe('pezzo');
  expect(getUnitLabel('piece', 2)).toBe('pezzi');
  expect(localizedUnits()).toContain('piece');
  expect(parseFractionalQuantity('1,75')).toBe(1.75);
});

test('every catalog entry has both translations and preserves all interpolation slots', () => {
  for (const [source, translations] of Object.entries(messages)) {
    const slots = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    for (const value of Object.values(translations)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(slots(value)).toEqual(slots(source));
    }
  }
});
