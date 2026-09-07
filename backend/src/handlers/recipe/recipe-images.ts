import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { parseObject } from '../../http/request';
import { response } from '../../http/response';

const s3 = new S3Client({});
const bucket = process.env.STORAGE_BUCKET;
const imageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRecipeImages(parsed: Record<string, unknown>): string | null {
  if (
    parsed.imageId != null &&
    (typeof parsed.imageId !== 'string' || !imageIdPattern.test(parsed.imageId))
  )
    return 'Invalid recipe image';
  if (parsed.instructionImageIds != null) {
    if (
      !Array.isArray(parsed.instructionImageIds) ||
      parsed.instructionImageIds.some(
        (id) => id !== null && (typeof id !== 'string' || !imageIdPattern.test(id)),
      )
    )
      return 'Invalid instruction images';
    const steps = Array.isArray(parsed.instructions)
      ? parsed.instructions
      : typeof parsed.instructions === 'string'
        ? [parsed.instructions]
        : null;
    if (!steps || steps.length !== parsed.instructionImageIds.length)
      return 'Instruction images must match the instruction steps';
  }
  return null;
}

export function decodeRecipeImage(body: string | null) {
  const parsed = parseObject(body ?? '');
  if (typeof parsed.dataUrl !== 'string' || parsed.dataUrl.length > 1_400_000)
    throw new Error('Invalid image');
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.dataUrl);
  if (!match) throw new Error('Invalid image');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1024 * 1024 || bytes.toString('base64') !== match[2])
    throw new Error('Invalid image');
  const valid =
    match[1] === 'jpeg'
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : match[1] === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('Invalid image');
  return { bytes, contentType: 'image/' + match[1] };
}

export async function recipeImageRequest(
  userId: string,
  method: string,
  imageId: string | undefined,
  body: string | null,
) {
  if (method === 'POST' && !imageId) {
    let image;
    try {
      image = decodeRecipeImage(body);
    } catch {
      return response(400, { message: 'Choose a JPG, PNG or WebP image up to 1 MB.' });
    }
    const id = randomUUID();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `recipe-images/${userId}/${id}`,
        Body: image.bytes,
        ContentType: image.contentType,
        CacheControl: 'private, max-age=3600',
      }),
    );
    return response(201, { imageId: id });
  }
  if (method === 'GET' && imageId && imageIdPattern.test(imageId)) {
    const object = { Bucket: bucket, Key: `recipe-images/${userId}/${imageId}` };
    try {
      await s3.send(new HeadObjectCommand(object));
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return response(404, { message: 'Image not found' });
      throw err;
    }
    const url = await getSignedUrl(s3, new GetObjectCommand(object), { expiresIn: 3600 });
    return response(200, { url });
  }
  return response(400, { message: 'Invalid image request' });
}
