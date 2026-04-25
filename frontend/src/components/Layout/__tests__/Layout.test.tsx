import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Layout, { PageId } from '../Layout';

describe('Layout', () => {
  const defaultProps = {
    activePage: 'inventory' as PageId,
    onNavigate: jest.fn(),
    children: <div data-testid="page-content">Test Content</div>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app title', () => {
    render(<Layout {...defaultProps} />);
    expect(screen.getByText('Pantry Tracking App')).toBeInTheDocument();
  });

  it('renders the online indicator', () => {
    render(<Layout {...defaultProps} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders all four navigation items', () => {
    render(<Layout {...defaultProps} />);
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText('Recipes')).toBeInTheDocument();
    expect(screen.getByText('Meal Plan')).toBeInTheDocument();
    expect(screen.getByText('Shopping List')).toBeInTheDocument();
  });

  it('renders children in the main content area', () => {
    render(<Layout {...defaultProps} />);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });

  it('marks the active page nav button with aria-current', () => {
    render(<Layout {...defaultProps} activePage="recipes" />);
    const recipesButton = screen.getByText('Recipes').closest('button');
    expect(recipesButton).toHaveAttribute('aria-current', 'page');

    const inventoryButton = screen.getByText('Inventory').closest('button');
    expect(inventoryButton).not.toHaveAttribute('aria-current');
  });

  it('calls onNavigate when a nav button is clicked', () => {
    const onNavigate = jest.fn();
    render(<Layout {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Recipes'));
    expect(onNavigate).toHaveBeenCalledWith('recipes');

    fireEvent.click(screen.getByText('Meal Plan'));
    expect(onNavigate).toHaveBeenCalledWith('meal-plan');
  });

  it('nav buttons have minimum 44px tap target height', () => {
    render(<Layout {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      const style = button.style;
      const minHeight = parseInt(style.minHeight, 10);
      expect(minHeight).toBeGreaterThanOrEqual(44);
    });
  });

  it('has an accessible navigation landmark', () => {
    render(<Layout {...defaultProps} />);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });
});
