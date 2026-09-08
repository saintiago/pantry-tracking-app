import type { APIGatewayProxyResult } from 'aws-lambda';
import { response } from '../../http/response';
import { parseObject } from '../../http/request';
import { fetchImport } from './import-fetch';
import { parseRecipePage } from './import-page';
import { extractWithBedrock } from './import-model';

export async function recipeImportRequest(body: string | null): Promise<APIGatewayProxyResult> {
  try {
    const parsed = parseObject(body ?? '');
    if (parsed.action === 'photo') {
      if (
        typeof parsed.dataUrl !== 'string' ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(parsed.dataUrl) ||
        parsed.dataUrl.length > 1400000
      )
        return response(400, { message: 'Choose a JPG, PNG or WebP image up to 20 MB.' });
      try {
        return response(200, { draft: await extractWithBedrock({ dataUrl: parsed.dataUrl }) });
      } catch {
        return response(200, {
          fallback: 'ocr',
          message:
            'AI extraction is unavailable. Use on-device text recognition or continue manually.',
        });
      }
    }
    if (typeof parsed.url !== 'string')
      return response(400, { message: 'Enter a valid public HTTPS recipe link.' });
    if (parsed.action === 'image') {
      const image = await fetchImport(parsed.url, true);
      return response(200, {
        dataUrl: `data:${image.contentType};base64,${image.body.toString('base64')}`,
      });
    }
    if (parsed.action !== undefined && parsed.action !== 'recipe')
      return response(400, { message: 'Invalid import action' });
    const page = await fetchImport(parsed.url);
    let draft = parseRecipePage(page.body.toString('utf8'), page.url);
    try {
      const interpreted = await extractWithBedrock({ text: draft.rawText });
      draft = { ...interpreted, sourceUrl: page.url, imageUrl: draft.imageUrl };
    } catch {
      draft = {
        ...draft,
        method: 'metadata',
        warnings: [
          ...draft.warnings,
          'AI extraction is unavailable. Review the webpage extraction carefully.',
        ],
      };
    }
    if (!draft.ingredients.length && !draft.instructions.length)
      return response(422, {
        message: 'No recipe could be extracted. Try another source or continue manually.',
      });
    return response(200, { draft });
  } catch (error) {
    const known =
      error instanceof Error &&
      /^(Enter a valid|This recipe link|The recipe link|Recipe import timed|Could not read|The source is too large)/.test(
        error.message,
      );
    return response(400, {
      message: known
        ? (error as Error).message
        : 'Could not import the recipe. Try another source or continue manually.',
    });
  }
}
