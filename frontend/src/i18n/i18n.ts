import { useSyncExternalStore } from 'react';
import { cachedCatalog, loadCatalog, type Catalog, type Language } from './catalogs';
export type { Language } from './catalogs';
export const languages: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
];
let language: Language = 'en';
let catalog = cachedCatalog('en')!;
let requestVersion = 0;
interface LanguageRequest {
  pending?: Language;
  failed?: Language;
}
let request: LanguageRequest = {};
const listeners = new Set<() => void>();
export const getLanguage = () => language;
const notify = () => listeners.forEach((listener) => listener());
export function cancelLanguageLoad(): void {
  requestVersion++;
  request = {};
  notify();
}
export function useLanguageRequest(): LanguageRequest {
  return useSyncExternalStore(
    subscribe,
    () => request,
    () => request,
  );
}
function activate(next: Language, nextCatalog: Catalog) {
  language = next;
  catalog = nextCatalog;
  templates = makeTemplates(catalog.messages);
  request = {};
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = t('Pantry Tracking App');
  }
  notify();
}
/** Commit language and catalog together; a late download cannot overwrite a newer choice. */
export function setLanguage(next: Language): Promise<boolean> {
  const version = ++requestVersion;
  const cached = cachedCatalog(next);
  if (cached) {
    activate(next, cached);
    return Promise.resolve(true);
  }
  request = { pending: next };
  notify();
  return loadCatalog(next).then(
    (downloaded) => {
      if (version !== requestVersion) return false;
      activate(next, downloaded);
      return true;
    },
    () => {
      if (version === requestVersion) {
        request = { failed: next };
        notify();
      }
      return false;
    },
  );
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Subscribe without remounting components, so forms and cooking progress survive a switch. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en' as Language);
}
export function supportedLanguage(value: unknown): Language | undefined {
  if (typeof value !== 'string') return undefined;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return languages.find((entry) => entry.code === base)?.code;
}
export function systemLanguage(preferences: readonly string[] = navigator.languages): Language {
  for (const preference of preferences) {
    const supported = supportedLanguage(preference);
    if (supported) return supported;
  }
  return 'en';
}

/** Only app-owned messages belong here. Never pass user names, tags or recipe text. */
export function t(source: string, ...values: (string | number | undefined | null)[]): string {
  const singular = Number(values[0]) === 1 ? catalog.singular[source] : undefined;
  const translated =
    language === 'en'
      ? source
      : (singular ??
        catalog.messages[source] ??
        (catalog.messages[source.trim()]
          ? source.replace(source.trim(), catalog.messages[source.trim()])
          : source));
  return translated.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : match,
  );
}

// Legacy/API messages are kept in English in state and translated on render, including
// after a language switch. Only known app templates are matched; captures are preserved.
function makeTemplates(messages: Record<string, string>) {
  return Object.keys(messages)
    .filter((key) => /\{\d+\}/.test(key))
    .map((key) => {
      const indices: number[] = [];
      const parts = key.split(/(\{\d+\})/).map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          indices.push(Number(part.slice(1, -1)));
          return '(.*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
      return { key, indices, pattern: new RegExp(`^${parts.join('')}$`, 's') };
    });
}
let templates = makeTemplates(catalog.messages);
export function message(source: string | undefined | null): string {
  if (!source) return '';
  if (language === 'en' || catalog.messages[source]) return t(source);
  for (const { key, indices, pattern } of templates) {
    const match = pattern.exec(source);
    if (!match) continue;
    const values: string[] = [];
    indices.forEach((index, i) => {
      values[index] = match[i + 1];
    });
    return t(key, ...values);
  }
  return source;
}
export function number(value: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2, ...options }).format(value);
}
export function date(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(language, options);
}

export function deviceKey(userId?: string): string {
  return `pantry-language-v1:${userId ?? 'guest'}`;
}
export interface DevicePreference {
  language: Language;
  source: 'explicit' | 'account' | 'system';
}
export function readDevice(userId?: string): DevicePreference | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(deviceKey(userId)) ?? 'null');
    if (!data || !['explicit', 'account', 'system'].includes(data.source)) return undefined;
    if (!languages.some((entry) => entry.code === data.language)) return undefined;
    return data as DevicePreference;
  } catch {
    return undefined;
  }
}
export function writeDevice(preference: DevicePreference, userId?: string): boolean {
  try {
    localStorage.setItem(deviceKey(userId), JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
