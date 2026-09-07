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
    if (value === undefined || value === null || value === '') {
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

  if (parsed.expirationDate && typeof parsed.expirationDate === 'string') {
    const date = new Date(parsed.expirationDate);
    if (isNaN(date.getTime())) {
      errors.push({ field: 'expirationDate', message: 'expirationDate must be a valid ISO date' });
    }
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
    'expirationDate',
    'locationId',
    'unit',
    'barcode',
    'brand',
    'whereToBuy',
    'onlineStoreLink',
    'pictureUrl',
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
  if (parsed.reassignGroup !== undefined && typeof parsed.reassignGroup !== 'boolean') {
    errors.push({ field: 'reassignGroup', message: 'reassignGroup must be a boolean' });
  }
  return errors;
}
