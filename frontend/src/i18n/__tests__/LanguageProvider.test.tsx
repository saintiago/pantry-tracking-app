import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageProvider } from '../LanguageProvider';
import LanguageSwitcher from '../../components/LanguageSwitcher/LanguageSwitcher';
import { getLanguage, readDevice, setLanguage, writeDevice } from '../i18n';
import { useAuth } from '../../auth/AuthContext/AuthContext';
import { getAccountLanguage, saveAccountLanguage } from '../../auth/cognitoClient/cognitoClient';
import es from '../locales/es.json';
import it from '../locales/it.json';

jest.mock('../../auth/AuthContext/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../auth/cognitoClient/cognitoClient', () => ({
  getAccountLanguage: jest.fn(),
  saveAccountLanguage: jest.fn(),
}));
const auth = useAuth as jest.Mock;
const getAccount = getAccountLanguage as jest.Mock;
const saveAccount = saveAccountLanguage as jest.Mock;
function view() {
  return (
    <LanguageProvider>
      <LanguageSwitcher />
    </LanguageProvider>
  );
}
beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => (String(url).includes('/es.') ? es : it),
  })) as jest.Mock;
  localStorage.clear();
  setLanguage('en');
  auth.mockReturnValue({ user: { userId: 'alice' }, isLoading: false });
  getAccount.mockResolvedValue(undefined);
  saveAccount.mockResolvedValue(undefined);
});
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  act(() => {
    void setLanguage('en');
  });
});

test('seeds the device from the fresh account preference, then keeps the device override', async () => {
  getAccount.mockResolvedValue('es-ES');
  const first = render(view());
  await waitFor(() => expect(getLanguage()).toBe('es'));
  expect(readDevice('alice')).toEqual({ language: 'es', source: 'account' });
  first.unmount();
  getAccount.mockResolvedValue('it');
  render(view());
  await waitFor(() => expect(getAccount).toHaveBeenCalledTimes(2));
  expect(getLanguage()).toBe('es');
});

test('a slow account response cannot overwrite a newer manual selection', async () => {
  let resolve!: (value: string) => void;
  getAccount.mockReturnValue(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  fireEvent.click(screen.getByRole('button', { name: /Italiano/ }));
  await act(async () => resolve('es'));
  expect(getLanguage()).toBe('it');
  expect(readDevice('alice')?.language).toBe('it');
});

test('account save failure retains the device selection and offers retry', async () => {
  saveAccount.mockRejectedValueOnce(new Error('offline'));
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  fireEvent.click(screen.getByRole('button', { name: /Español/ }));
  const save = await screen.findByRole('button', { name: 'Usar este idioma para la cuenta' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
  expect(readDevice('alice')?.language).toBe('es');
  fireEvent.click(save);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(saveAccount).toHaveBeenLastCalledWith('es');
});

test('automatic login-screen detection does not mask the account language', async () => {
  auth.mockReturnValue({ user: null, isLoading: false });
  const rendered = render(view());
  await waitFor(() => expect(readDevice()?.source).toBe('system'));
  getAccount.mockResolvedValue('it');
  auth.mockReturnValue({ user: { userId: 'alice' }, isLoading: false });
  rendered.rerender(view());
  await waitFor(() => expect(getLanguage()).toBe('it'));
});

test('a deliberate login-screen selection prevails over the account', async () => {
  auth.mockReturnValue({ user: null, isLoading: false });
  const rendered = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  fireEvent.click(screen.getByRole('button', { name: /Italiano/ }));
  getAccount.mockResolvedValue('es');
  auth.mockReturnValue({ user: { userId: 'alice' }, isLoading: false });
  rendered.rerender(view());
  await waitFor(() => expect(readDevice('alice')?.language).toBe('it'));
});

test('failed account reads do not permanently save a provisional fallback', async () => {
  getAccount.mockRejectedValue(new Error('offline'));
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load your account language',
  );
  expect(readDevice('alice')).toBeUndefined();
});

test('switching accounts ignores the previous account and its late response', async () => {
  let resolve!: (value: string) => void;
  getAccount.mockReturnValueOnce(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  const rendered = render(view());
  auth.mockReturnValue({ user: { userId: 'bob' }, isLoading: false });
  getAccount.mockResolvedValue('it');
  rendered.rerender(view());
  await waitFor(() => expect(getLanguage()).toBe('it'));
  await act(async () => resolve('es'));
  expect(getLanguage()).toBe('it');
  expect(readDevice('alice')).toBeUndefined();
});

test('another tab updates the current device language', async () => {
  writeDevice({ language: 'en', source: 'explicit' }, 'alice');
  render(view());
  await waitFor(() => expect(getAccount).toHaveBeenCalled());
  act(() => {
    writeDevice({ language: 'es', source: 'explicit' }, 'alice');
    window.dispatchEvent(new StorageEvent('storage', { key: 'pantry-language-v1:alice' }));
  });
  await waitFor(() => expect(getLanguage()).toBe('es'));
});
