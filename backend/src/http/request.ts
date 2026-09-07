/** JSON objects are the only supported mutation envelope. Types alone cannot validate JSON. */
export function parseObject(body: string): Record<string, unknown> {
  const value: unknown = JSON.parse(body);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid JSON body');
  }
  return value as Record<string, unknown>;
}

/** Cursors remain opaque to clients and may only address this user's inventory. */
export function inventoryCursor(raw: string | undefined, userId: string) {
  if (!raw) return undefined;
  const value = parseObject(decodeURIComponent(raw));
  if (
    value.PK !== `USER#${userId}` ||
    typeof value.SK !== 'string' ||
    !value.SK.startsWith('ITEM#') ||
    Object.keys(value).some((key) => key !== 'PK' && key !== 'SK')
  ) {
    throw new Error('Invalid inventory cursor');
  }
  return value;
}
