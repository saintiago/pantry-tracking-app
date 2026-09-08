import { useSyncExternalStore } from 'react';
import { VALID_UNITS, type UnitType } from '@pantry/domain';
export type MeasurementSystem = 'original' | 'metric' | 'imperial';
export type Appearance = 'pastel' | 'minimal' | 'system';
export interface Preferences {
  measurement: MeasurementSystem;
  appearance: Appearance;
  units: UnitType[] | null;
}
export const defaults: Preferences = { measurement: 'original', appearance: 'pastel', units: null };
let current = defaults;
let owner = 'guest';
let error = '';
const listeners = new Set<() => void>();
export const preferenceKey = (id: string) => `pantry-settings-v1:${id}`;
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    return {
      measurement: ['original', 'metric', 'imperial'].includes(value.measurement)
        ? value.measurement
        : 'original',
      appearance: ['pastel', 'minimal', 'system'].includes(value.appearance)
        ? value.appearance
        : 'pastel',
      units:
        Array.isArray(value.units) &&
        value.units.length &&
        value.units.every((u: unknown) => VALID_UNITS.includes(u as UnitType))
          ? [...new Set<UnitType>(value.units)]
          : null,
    };
  } catch {
    return defaults;
  }
}
const notify = () => listeners.forEach((listener) => listener());
export const getPreferences = () => current;
export const preferenceError = () => error;
export function loadPreferences(id: string) {
  owner = id;
  error = '';
  try {
    current = parsePreferences(localStorage.getItem(preferenceKey(owner)));
  } catch {
    current = defaults;
    error = 'Settings could not be read on this device.';
  }
  notify();
}
export function savePreferences(next: Preferences) {
  current = next;
  error = '';
  try {
    localStorage.setItem(preferenceKey(owner), JSON.stringify(next));
  } catch {
    error = 'Settings work for this session, but could not be saved on this device.';
  }
  notify();
}
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usePreferences() {
  return useSyncExternalStore(subscribePreferences, getPreferences, () => defaults);
}
export function appText(text: string): string {
  return current.appearance === 'minimal'
    ? text
        .replace(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu, '')
        .trim()
    : text;
}
