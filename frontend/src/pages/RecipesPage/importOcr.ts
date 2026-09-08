import { createWorker } from 'tesseract.js';
import { parseRecipeText } from '@pantry/domain';
export async function recognizeRecipe(
  dataUrl: string,
  language: string,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const root = `${window.location.origin}/ocr/v6.0.1/`;
  const worker = await createWorker(language, 1, {
    workerPath: `${root}worker.min.js`,
    corePath: root,
    langPath: root,
    workerBlobURL: false,
    logger: (event) => {
      if (event.status === 'recognizing text') progress(Math.round(event.progress * 100));
    },
  });
  const cancel = () => {
    void worker.terminate();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new Error('Import cancelled');
    const result = await worker.recognize(dataUrl);
    if (signal.aborted) throw new Error('Import cancelled');
    const draft = parseRecipeText(result.data.text);
    if (!draft.ingredients.length && !draft.instructions.length)
      throw new Error('No recipe could be extracted. Try another source or continue manually.');
    return { ...draft, method: 'ocr' as const };
  } finally {
    signal.removeEventListener('abort', cancel);
    await worker.terminate();
  }
}
