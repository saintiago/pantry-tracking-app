import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShareButton from '../ShareButton';
afterEach(() => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
});
test('shares only after the user clicks and treats native cancellation as cancellation', async () => {
  const share = jest
    .fn()
    .mockRejectedValue(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  render(<ShareButton title="Meal Plan" text="Monday: soup" />);
  expect(share).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Share Meal Plan' }));
  await waitFor(() =>
    expect(share).toHaveBeenCalledWith({ title: 'Meal Plan', text: 'Monday: soup' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('unsupported native sharing offers copyable plain text', () => {
  render(<ShareButton title="Shopping List" text="Ginger — 100 g" />);
  fireEvent.click(screen.getByRole('button', { name: 'Share Shopping List' }));
  expect(screen.getByRole('textbox', { name: 'Text to share' })).toHaveValue('Ginger — 100 g');
});
