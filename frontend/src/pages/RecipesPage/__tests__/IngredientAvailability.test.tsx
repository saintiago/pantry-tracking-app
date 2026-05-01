import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import IngredientAvailability from '../IngredientAvailability';
import { IngredientStatus } from '../../../api/recipes/recipes';

const available: IngredientStatus = { name: 'Flour', required: 2, unit: 'Kilo', available: 3, status: 'available' };
const partial: IngredientStatus = { name: 'Sugar', required: 4, unit: 'Gram', available: 2, status: 'partial' };
const missing: IngredientStatus = { name: 'Eggs', required: 3, unit: 'Unit', available: 0, status: 'missing' };

describe('IngredientAvailability', () => {
  it('shows "All ingredients available" when missingCount is 0', () => {
    render(<IngredientAvailability availability={[available]} missingCount={0} />);
    expect(screen.getByText('All ingredients available')).toBeInTheDocument();
  });

  it('shows "X ingredient(s) missing or partial" when missingCount > 0', () => {
    render(<IngredientAvailability availability={[missing]} missingCount={1} />);
    expect(screen.getByText('1 ingredient(s) missing or partial')).toBeInTheDocument();
  });

  it('renders ingredient names', () => {
    render(<IngredientAvailability availability={[available, partial, missing]} missingCount={2} />);
    expect(screen.getByText('Flour')).toBeInTheDocument();
    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.getByText('Eggs')).toBeInTheDocument();
  });

  it('shows "available" chip for available ingredients', () => {
    render(<IngredientAvailability availability={[available]} missingCount={0} />);
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  it('shows "missing" chip for missing ingredients', () => {
    render(<IngredientAvailability availability={[missing]} missingCount={1} />);
    expect(screen.getByText('missing')).toBeInTheDocument();
  });

  it('shows "have X / need Y unit" for partial ingredients', () => {
    render(<IngredientAvailability availability={[partial]} missingCount={1} />);
    expect(screen.getByText('have 2 / need 4 grams')).toBeInTheDocument();
  });

  it('applies green chip color for available status', () => {
    render(<IngredientAvailability availability={[available]} missingCount={0} />);
    const chip = screen.getByText('available');
    expect(chip).toHaveStyle({ backgroundColor: '#16a34a' });
  });

  it('applies amber chip color for partial status', () => {
    render(<IngredientAvailability availability={[partial]} missingCount={1} />);
    const chip = screen.getByText('have 2 / need 4 grams');
    expect(chip).toHaveStyle({ backgroundColor: '#f59e0b' });
  });

  it('applies red chip color for missing status', () => {
    render(<IngredientAvailability availability={[missing]} missingCount={1} />);
    const chip = screen.getByText('missing');
    expect(chip).toHaveStyle({ backgroundColor: '#dc2626' });
  });
});
