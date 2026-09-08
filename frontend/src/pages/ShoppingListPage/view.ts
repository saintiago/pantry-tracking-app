import { getLanguage } from '../../i18n/i18n';
import type { Arrangement } from './arrangement';
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(getLanguage(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
export interface ShoppingView {
  arrangement?: Arrangement;
  start: string;
  weeks: number;
  days: string[];
  recipes: string[];
  past: boolean;
  showStock: boolean;
  search: string;
  mode: 'planning' | 'shopping' | 'order';
  store: string;
}
// Preserve the trip while visiting purchase/preferences pages in this session.
export const views = new Map<string, ShoppingView>();
