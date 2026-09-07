/** Resize phone photos before upload, retaining a bounded, broadly supported raster. */
export async function preparePhoto(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error('Choose a JPG, PNG or WebP image up to 20 MB.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Could not prepare image.');
  });
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image.');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5, 0.3]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= 1_350_000) return data;
    }
    throw new Error('Image is too large. Choose a smaller image.');
  } finally {
    bitmap.close();
  }
}
