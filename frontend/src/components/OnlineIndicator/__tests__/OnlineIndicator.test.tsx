import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnlineIndicator from '../OnlineIndicator';

describe('OnlineIndicator', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
    }
  });

  it('shows "Online" when navigator.onLine is true', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { value: true, configurable: true });
    render(<OnlineIndicator />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Online');
  });

  it('shows "Offline" when navigator.onLine is false', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { value: false, configurable: true });
    render(<OnlineIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Offline');
  });

  it('updates when going offline', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { value: true, configurable: true });
    render(<OnlineIndicator />);
    expect(screen.getByText('Online')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('updates when going online', () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { value: false, configurable: true });
    render(<OnlineIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
