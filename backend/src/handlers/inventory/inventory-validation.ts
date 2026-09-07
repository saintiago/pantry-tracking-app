import { VALID_UNITS, LEGACY_UNIT_MAP } from '../../types/units';
const ACCEPTED_UNITS = new Set([...VALID_UNITS, ...Object.keys(LEGACY_UNIT_MAP)]);

const REQUIRED_FIELDS = ['name', 'category', 'expirationDate', 'locationId', 'quantity', 'unit'];

export function validateAddRequest(
  parsed: Record<string, unknown>,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  if (parsed.locationDetails !== undefined && typeof parsed.locationDetails !== 'string') {
    errors.push({ field: 'locationDetails', message: 'locationDetails must be text' });
  }

  for (const field of REQUIRED_FIELDS) {
    const value = parsed[field];
    if (value === undefined || (value === null && field !== 'expirationDate') || value === '') {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (
    parsed.quantity !== undefined &&
    (typeof parsed.quantity !== 'number' ||
      !Number.isFinite(parsed.quantity) ||
      parsed.quantity < 0)
  ) {
    errors.push({ field: 'quantity', message: 'quantity must be non-negative' });
  }

  if (
    parsed.unit !== undefined &&
    parsed.unit !== null &&
    parsed.unit !== '' &&
    !ACCEPTED_UNITS.has(parsed.unit as string)
  ) {
    errors.push({ field: 'unit', message: `unit must be one of: ${VALID_UNITS.join(', ')}` });
  }

  errors.push(...validateInventoryFields(parsed));
  return errors;
}

export function validateInventoryFields(
  parsed: Record<string, unknown>,
): { field: string; message: string }[] {
  const errors: { field: string; message: string }[] = [];
  for (const field of [
    'name',
    'category',
    'locationId',
    'unit',
    'barcode',
    'brand',
    'whereToBuy',
    'onlineStoreLink',
    'pictureUrl',
    'icon',
  ]) {
    const value = parsed[field];
    if (
      value !== undefined &&
      (typeof value !== 'string' ||
        (['name', 'category', 'locationId', 'unit', 'expirationDate'].includes(field) &&
          !value.trim()))
    ) {
      errors.push({ field, message: `${field} must be text` });
    }
  }
  const expiration = parsed.expirationDate;
  if (
    expiration !== undefined &&
    expiration !== null &&
    (typeof expiration !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expiration) ||
      !Number.isFinite(Date.parse(expiration + 'T12:00:00Z')) ||
      new Date(expiration + 'T12:00:00Z').toISOString().slice(0, 10) !== expiration)
  ) {
    errors.push({
      field: 'expirationDate',
      message: 'expirationDate must be a valid ISO date or null',
    });
  }
  if (
    typeof parsed.icon === 'string' &&
    (parsed.icon.length > 32 || Array.from(parsed.icon).some((char) => char.charCodeAt(0) < 32))
  )
    errors.push({
      field: 'icon',
      message: 'icon must be at most 32 characters without control characters',
    });
  if (parsed.reassignGroup !== undefined && typeof parsed.reassignGroup !== 'boolean') {
    errors.push({ field: 'reassignGroup', message: 'reassignGroup must be a boolean' });
  }
  return errors;
}
