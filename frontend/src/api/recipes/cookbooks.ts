import { apiRequest } from '../client';
import type { Cookbook } from '@pantry/domain';
export async function fetchCookbooks(signal?: AbortSignal): Promise<Cookbook[]> {
  const result = await apiRequest<{ cookbooks: Cookbook[] }>(
    '/cookbooks',
    'Could not load cookbooks. Try again.',
    { signal, timeoutMs: 10000 },
  );
  if (!Array.isArray(result?.cookbooks)) throw new Error('Could not load cookbooks. Try again.');
  return result.cookbooks;
}
export function saveCookbook(
  book: Pick<Cookbook, 'name' | 'description' | 'recipeIds' | 'imageId'> &
    Partial<Pick<Cookbook, 'cookbookId' | 'version'>>,
) {
  return apiRequest<Cookbook>(
    book.cookbookId ? `/cookbooks/${encodeURIComponent(book.cookbookId)}` : '/cookbooks',
    'Could not save cookbook. Try again.',
    { method: book.cookbookId ? 'PUT' : 'POST', body: JSON.stringify(book) },
  );
}
export function deleteCookbook(book: Cookbook) {
  return apiRequest(
    `/cookbooks/${encodeURIComponent(book.cookbookId)}`,
    'Could not remove cookbook. Try again.',
    { method: 'DELETE', body: JSON.stringify({ version: book.version }) },
  );
}
