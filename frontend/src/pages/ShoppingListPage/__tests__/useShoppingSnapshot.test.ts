import { act, renderHook, waitFor } from '@testing-library/react';
import { useShoppingSnapshot } from '../useShoppingSnapshot';
import { fetchShoppingData } from '../../../api/shopping-list/shopping-list';
import type { ShoppingData } from '../../../api/shopping-list/types';

jest.mock('../../../api/shopping-list/shopping-list', () => ({ fetchShoppingData: jest.fn() }));
const fetchData = jest.mocked(fetchShoppingData);
const empty: ShoppingData = { items: [], groups: [], recipes: [], plans: [] };
beforeEach(() => jest.resetAllMocks());

test('ignores stale responses and aborts the previous period', async () => {
  let resolveOld!: (data: ShoppingData) => void;
  fetchData
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(empty);
  const { result, rerender, unmount } = renderHook(
    ({ start }) => useShoppingSnapshot('alice', start, 'end'),
    { initialProps: { start: 'old' } },
  );
  const signal = fetchData.mock.calls[0][2];
  rerender({ start: 'new' });
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.snapshot?.start).toBe('new'));
  await act(async () =>
    resolveOld({ ...empty, items: [{ itemId: 'stale' }] as ShoppingData['items'] }),
  );
  expect(result.current.snapshot?.data.items).toEqual([]);
  unmount();
  expect(fetchData.mock.calls[1][2].aborted).toBe(true);
});

test('retries a failed load and refreshes after reconnect', async () => {
  fetchData.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(empty);
  const { result } = renderHook(() => useShoppingSnapshot('alice', 'start', 'end'));
  await waitFor(() => expect(result.current.error).toBe('Unavailable'));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.snapshot?.data).toEqual(empty));
  expect(result.current.error).toBe('');
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(3));
});

test('never exposes a prior account snapshot while the next account loads', async () => {
  fetchData.mockResolvedValueOnce(empty).mockImplementationOnce(() => new Promise(() => {}));
  const { result, rerender } = renderHook(({ user }) => useShoppingSnapshot(user, 'start', 'end'), {
    initialProps: { user: 'alice' },
  });
  await waitFor(() => expect(result.current.snapshot).not.toBeNull());
  rerender({ user: 'bob' });
  expect(result.current.snapshot).toBeNull();
});
