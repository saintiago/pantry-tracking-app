import type { RecipeImportDraft } from '@pantry/domain';
import { apiRequest } from '../client';
export interface ImportResult {
  draft?: RecipeImportDraft;
  fallback?: 'ocr';
  message?: string;
}
export function importRecipe(
  input: { action: 'recipe'; url: string } | { action: 'photo'; dataUrl: string },
  signal?: AbortSignal,
) {
  return apiRequest<ImportResult>(
    '/recipe-import',
    'Could not import the recipe. Try another source or continue manually.',
    {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
      timeoutMs: 30000,
    },
  );
}
export function importSourceImage(url: string, signal?: AbortSignal) {
  return apiRequest<{ dataUrl: string }>('/recipe-import', 'Could not load image.', {
    method: 'POST',
    body: JSON.stringify({ action: 'image', url }),
    signal,
    timeoutMs: 10000,
  });
}
