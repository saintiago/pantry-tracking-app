import { catalogUrls } from './catalog-urls';

export type Language = 'en' | keyof typeof catalogUrls;
export interface Catalog {
  messages: Record<string, string>;
  singular: Record<string, string>;
}
const english: Catalog = { messages: {}, singular: {} };
const loaded = new Map<Language, Catalog>([['en', english]]);
const pending = new Map<Language, Promise<Catalog>>();
export const cachedCatalog = (language: Language) => loaded.get(language);

function validEntries(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

/** Cache successful downloads and share concurrent requests; failures remain retryable. */
export function loadCatalog(language: Language): Promise<Catalog> {
  const cached = loaded.get(language);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(language);
  if (existing) return existing;
  const request = Promise.resolve().then(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(catalogUrls[language as keyof typeof catalogUrls], {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Language download failed');
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        !('messages' in data) ||
        !validEntries(data.messages) ||
        !('singular' in data) ||
        !validEntries(data.singular)
      ) {
        throw new Error('Invalid language catalog');
      }
      const catalog = { messages: data.messages, singular: data.singular };
      loaded.set(language, catalog);
      return catalog;
    } finally {
      clearTimeout(timer);
      pending.delete(language);
    }
  });
  pending.set(language, request);
  return request;
}
