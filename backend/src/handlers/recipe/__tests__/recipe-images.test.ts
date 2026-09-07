const mockS3Send = jest.fn();
const mockSign = jest.fn().mockResolvedValue('https://signed-image.test/photo');
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn((input) => ({ type: 'put', ...input })),
  HeadObjectCommand: jest.fn((input) => ({ type: 'head', ...input })),
  GetObjectCommand: jest.fn((input) => ({ type: 'get', ...input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockSign(...args),
}));
import { decodeRecipeImage, recipeImageRequest, validateRecipeImages } from '../recipe-images';
const id = '11111111-1111-4111-8111-111111111111';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
beforeEach(() => {
  mockS3Send.mockReset();
  mockSign.mockClear();
});
test('stores bytes privately under the authenticated account and returns only an immutable ID', async () => {
  mockS3Send.mockResolvedValue({});
  const result = await recipeImageRequest(
    'owner',
    'POST',
    undefined,
    JSON.stringify({ dataUrl: png }),
  );
  expect(result.statusCode).toBe(201);
  const { imageId } = JSON.parse(result.body);
  expect(imageId).toMatch(/^[0-9a-f-]{36}$/);
  expect(mockS3Send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'put',
      Key: `recipe-images/owner/${imageId}`,
      ContentType: 'image/png',
      CacheControl: 'private, max-age=3600',
      Body: expect.any(Buffer),
    }),
  );
});
test.each([
  '{}',
  '[]',
  'null',
  'invalid',
  JSON.stringify({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }),
  JSON.stringify({ dataUrl: 'data:image/png;base64,aGVsbG8=' }),
  JSON.stringify({
    dataUrl: 'data:image/jpeg;base64,' + Buffer.alloc(1024 * 1024 + 1, 255).toString('base64'),
  }),
])('rejects malformed, unsupported or oversized uploads without storage writes', async (body) => {
  expect((await recipeImageRequest('owner', 'POST', undefined, body)).statusCode).toBe(400);
  expect(mockS3Send).not.toHaveBeenCalled();
});
test('reads only the requesting account prefix and signs for one hour', async () => {
  mockS3Send.mockResolvedValue({});
  expect((await recipeImageRequest('second-user', 'GET', id, null)).statusCode).toBe(200);
  expect(mockS3Send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'head', Key: `recipe-images/second-user/${id}` }),
  );
  expect(mockSign).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ type: 'get', Key: `recipe-images/second-user/${id}` }),
    { expiresIn: 3600 },
  );
});
test('missing images return 404 without issuing a download URL', async () => {
  mockS3Send.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });
  expect((await recipeImageRequest('other-user', 'GET', id, null)).statusCode).toBe(404);
  expect(mockSign).not.toHaveBeenCalled();
});
test('rejects path traversal and arbitrary object keys', async () => {
  expect((await recipeImageRequest('owner', 'GET', '../someone/photo', null)).statusCode).toBe(400);
  expect(mockS3Send).not.toHaveBeenCalled();
});
test('validates optional image references and instruction alignment while accepting legacy recipes', () => {
  expect(validateRecipeImages({ instructions: 'Cook' })).toBeNull();
  expect(validateRecipeImages({ imageId: null, instructionImageIds: null })).toBeNull();
  expect(
    validateRecipeImages({
      imageId: id,
      instructions: ['First', 'Second'],
      instructionImageIds: [null, id],
    }),
  ).toBeNull();
  expect(validateRecipeImages({ imageId: 'https://public-image.test' })).toBe(
    'Invalid recipe image',
  );
  expect(
    validateRecipeImages({ instructions: ['First'], instructionImageIds: [id, null] }),
  ).toMatch('must match');
  expect(validateRecipeImages({ instructionImageIds: [id] })).toMatch('must match');
  expect(decodeRecipeImage(JSON.stringify({ dataUrl: png })).contentType).toBe('image/png');
});
