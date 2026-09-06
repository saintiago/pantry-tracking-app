import { t } from '../../i18n/i18n';

/** Translate only the placeholder; user-written store names always remain original. */
export const storeLabel = (store: string): string => store || t('Any store');
