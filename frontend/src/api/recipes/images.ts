import { apiRequest } from '../client';

export async function uploadRecipeImage(dataUrl: string): Promise<string> {
  const result = await apiRequest<{ imageId: string }>(
    '/recipe-images',
    'Could not upload image. Try again.',
    {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    },
  );
  return result.imageId;
}
export async function fetchRecipeImage(imageId: string): Promise<string> {
  const result = await apiRequest<{ url: string }>(
    `/recipe-images/${encodeURIComponent(imageId)}`,
    'Could not load image.',
  );
  return result.url;
}
