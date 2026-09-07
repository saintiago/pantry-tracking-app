import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageProvider } from '../LanguageProvider';
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher';
import { getLanguage, readDevice, setLanguage, writeDevice } from '../i18n';
import { loadCatalog, type Catalog } from '../catalogs';
import { useAuth } from '../../auth/AuthContext/AuthContext';
import { getAccountLanguage } from '../../auth/cognitoClient/cognitoClient';

jest.mock('../catalogs', () => ({
  cachedCatalog: (language: string) =>
    language === 'en' ? { messages: {}, singular: {} } : undefined,
  loadCatalog: jest.fn(),
}));
jest.mock('../../auth/AuthContext/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../auth/cognitoClient/cognitoClient', () => ({
  getAccountLanguage: jest.fn(),
  saveAccountLanguage: jest.fn(),
}));
const load = loadCatalog as jest.Mock;
const auth = useAuth as jest.Mock;
const account = getAccountLanguage as jest.Mock;
const catalog: Catalog = { messages: {}, singular: {} };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function view() {
  return (
    <LanguageProvider>
      <LanguageSwitcher />
      <input aria-label="Draft" />
    </LanguageProvider>
  );
}
beforeEach(async () => {
  jest.clearAllMocks();
  localStorage.clear();
  await setLanguage('en');
  auth.mockReturnValue({ user: { userId: 'alice' }, isLoading: false });
  account.mockResolvedValue('en');
  load.mockResolvedValue(catalog);
});
afterEach(() => {
  act(() => {
    void setLanguage('en');
  });
});

test('retains the current language and draft during failure; retry alone persists the choice', async () => {
  writeDevice({ language: 'en', source: 'explicit' }, 'alice');
  load.mockRejectedValueOnce(new Error('offline'));
  render(view());
  fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Unsaved recipe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  fireEvent.click(screen.getByRole('button', { name: /Español/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load Español');
  expect(getLanguage()).toBe('en');
  expect(readDevice('alice')?.language).toBe('en');
  fireEvent.click(screen.getByRole('button', { name: 'Retry language download' }));
  await waitFor(() => expect(getLanguage()).toBe('es'));
  expect(readDevice('alice')?.language).toBe('es');
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved recipe');
  expect(load).toHaveBeenCalledTimes(2);
});

test('a slower earlier catalog cannot overwrite the latest choice or its saved preference', async () => {
  const slow = deferred<Catalog>();
  load.mockImplementation((language) =>
    language === 'es' ? slow.promise : Promise.resolve(catalog),
  );
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  fireEvent.click(screen.getByRole('button', { name: /Español/ }));
  expect(screen.getByRole('status')).toHaveTextContent('Loading Español');
  fireEvent.click(screen.getByRole('button', { name: /Italiano/ }));
  await waitFor(() => expect(getLanguage()).toBe('it'));
  await act(async () => slow.resolve(catalog));
  expect(getLanguage()).toBe('it');
  expect(readDevice('alice')?.language).toBe('it');
});

test('resolves the account first without downloading a provisional system language', async () => {
  const profile = deferred<string>();
  account.mockReturnValue(profile.promise);
  jest.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-ES']);
  const rendered = render(view());
  expect(load).not.toHaveBeenCalled();
  await act(async () => profile.resolve('it'));
  await waitFor(() => expect(getLanguage()).toBe('it'));
  expect(load.mock.calls.map(([language]) => language)).toEqual(['it']);
  rendered.unmount();
  jest.restoreAllMocks();
});

test('account switches cancel pending catalog activation and persistence', async () => {
  const slow = deferred<Catalog>();
  load.mockReturnValue(slow.promise);
  writeDevice({ language: 'es', source: 'explicit' }, 'alice');
  const rendered = render(view());
  await waitFor(() => expect(load).toHaveBeenCalledWith('es'));
  auth.mockReturnValue({ user: { userId: 'bob' }, isLoading: false });
  rendered.rerender(view());
  await act(async () => slow.resolve(catalog));
  await waitFor(() => expect(readDevice('bob')?.language).toBe('en'));
  expect(getLanguage()).toBe('en');
});
