import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PasswordStrength from '../PasswordStrength';

describe('PasswordStrength', () => {
  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Weak" with 1 rule passed (only lowercase)', () => {
    render(<PasswordStrength password="abc" />);
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('shows "Fair" with 2 rules passed (lowercase + uppercase)', () => {
    render(<PasswordStrength password="abcA" />);
    expect(screen.getByText('Fair')).toBeInTheDocument();
  });

  it('shows "Good" with 3 rules passed (lower + upper + digit)', () => {
    render(<PasswordStrength password="abcA1" />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('shows "Strong" with 4 rules passed (lower + upper + digit + special)', () => {
    render(<PasswordStrength password="aA1!" />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('shows "Very strong" when all 5 rules pass', () => {
    render(<PasswordStrength password="abcABC1!" />);
    expect(screen.getByText('Very strong')).toBeInTheDocument();
  });

  it('displays all 5 rule labels', () => {
    render(<PasswordStrength password="a" />);
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument();
    expect(screen.getByText(/Uppercase letter/)).toBeInTheDocument();
    expect(screen.getByText(/Lowercase letter/)).toBeInTheDocument();
    expect(screen.getByText(/Number/)).toBeInTheDocument();
    expect(screen.getByText(/Special character/)).toBeInTheDocument();
  });

  it('marks passing rules with ✓ and failing with ○', () => {
    render(<PasswordStrength password="abcdefgh" />);
    const items = screen.getAllByRole('listitem');
    // "At least 8 characters" and "Lowercase letter" pass
    expect(items[0].textContent).toContain('✓'); // 8+ chars
    expect(items[1].textContent).toContain('○'); // uppercase
    expect(items[2].textContent).toContain('✓'); // lowercase
    expect(items[3].textContent).toContain('○'); // number
    expect(items[4].textContent).toContain('○'); // special
  });

  it('has aria-live="polite" for accessibility', () => {
    render(<PasswordStrength password="test" />);
    const container = screen.getByText('Weak').closest('[aria-live]');
    expect(container).toHaveAttribute('aria-live', 'polite');
  });

  it('renders 5 bar segments', () => {
    const { container } = render(<PasswordStrength password="a" />);
    const segments = container.querySelectorAll('[style*="border-radius"]');
    // 5 segments + the track itself = filter to just the small ones
    const barSegments = Array.from(segments).filter(
      (el) => el.children.length === 0 && el.tagName === 'DIV',
    );
    expect(barSegments).toHaveLength(5);
  });
});
