import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AddItemModal, { AddItemModalProps, AddItemData } from './AddItemModal';
import type { StorageLocation } from '../api/locations';

const makeLocation = (id: string, name: string): StorageLocation => ({
  locationId: id,
  name,
  createdAt: new Date().toISOString(),
});

const defaultLocations: StorageLocation[] = [
  makeLocation('loc-1', 'Pantry'),
  makeLocation('loc-2', 'Fridge'),
];

const noopSubmit = jest.fn(async () => ({}));

const renderModal = (overrides: Partial<AddItemModalProps> = {}) => {
  const props: AddItemModalProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: noopSubmit,
    locations: defaultLocations,
    ...overrides,
  };
  const result = render(<AddItemModal {...props} />);
  return { ...result, props };
};

const getSubmitButton = () => screen.getByRole('button', { name: /^add item$/i });

const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/product name/i), 'Milk');
  await user.type(screen.getByLabelText(/category/i), 'Dairy');
  await user.type(screen.getByLabelText(/expiration date/i), '2025-12-31');
  await user.selectOptions(screen.getByLabelText(/storage location/i), 'loc-1');
  await user.type(screen.getByLabelText(/quantity/i), '2');
  await user.type(screen.getByLabelText(/^unit/i), 'liters');
};

describe('AddItemModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      renderModal({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when isOpen is true', () => {
      renderModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has accessible dialog attributes', () => {
      renderModal();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'add-item-modal-title');
      expect(screen.getByRole('heading', { name: 'Add Item' })).toBeInTheDocument();
    });

    it('renders all required field labels', () => {
      renderModal();
      expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expiration date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/storage location/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^unit/i)).toBeInTheDocument();
    });

    it('renders all optional field labels', () => {
      renderModal();
      expect(screen.getByLabelText(/barcode/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/brand/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/where to buy/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/online store link/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/picture/i)).toBeInTheDocument();
    });

    it('populates location dropdown from props', () => {
      renderModal();
      const select = screen.getByLabelText(/storage location/i);
      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(3); // placeholder + 2 locations
      expect(options[1]).toHaveTextContent('Pantry');
      expect(options[2]).toHaveTextContent('Fridge');
    });
  });

  describe('validation', () => {
    it('shows inline errors for all empty required fields on submit', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(getSubmitButton());

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThanOrEqual(6);
      expect(screen.getByText('Product name is required.')).toBeInTheDocument();
      expect(screen.getByText('Category is required.')).toBeInTheDocument();
      expect(screen.getByText('Expiration date is required.')).toBeInTheDocument();
      expect(screen.getByText('Storage location is required.')).toBeInTheDocument();
      expect(screen.getByText('Quantity is required.')).toBeInTheDocument();
      expect(screen.getByText('Unit is required.')).toBeInTheDocument();
    });

    it('shows error for negative quantity', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(screen.getByLabelText(/product name/i), 'Milk');
      await user.type(screen.getByLabelText(/category/i), 'Dairy');
      await user.type(screen.getByLabelText(/expiration date/i), '2025-12-31');
      await user.selectOptions(screen.getByLabelText(/storage location/i), 'loc-1');
      await user.type(screen.getByLabelText(/quantity/i), '-5');
      await user.type(screen.getByLabelText(/^unit/i), 'kg');

      await user.click(getSubmitButton());

      expect(screen.getByText('Quantity must be non-negative.')).toBeInTheDocument();
    });

    it('clears field error when user types in that field', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(getSubmitButton());
      expect(screen.getByText('Product name is required.')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/product name/i), 'M');
      expect(screen.queryByText('Product name is required.')).not.toBeInTheDocument();
    });

    it('does not call onSubmit when validation fails', async () => {
      const user = userEvent.setup();
      const { props } = renderModal();

      await user.click(getSubmitButton());
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('calls onSubmit with correct data for required fields', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({}));
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.click(getSubmitButton());

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Milk',
          category: 'Dairy',
          expirationDate: '2025-12-31',
          locationId: 'loc-1',
          quantity: 2,
          unit: 'liters',
        }),
      );
    });

    it('includes optional fields when filled', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({}));
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.type(screen.getByLabelText(/barcode/i), '1234567890');
      await user.type(screen.getByLabelText(/brand/i), 'FarmFresh');
      await user.type(screen.getByLabelText(/where to buy/i), 'Grocery Store');
      await user.type(screen.getByLabelText(/online store link/i), 'https://example.com');

      await user.click(getSubmitButton());

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '1234567890',
          brand: 'FarmFresh',
          whereToBuy: 'Grocery Store',
          onlineStoreLink: 'https://example.com',
        }),
      );
    });

    it('shows success message after successful submit', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({}));
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.click(getSubmitButton());

      expect(screen.getByText('Item added successfully!')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('displays error from onSubmit', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({ error: 'Server error occurred' }));
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.click(getSubmitButton());

      expect(screen.getByText('Server error occurred')).toBeInTheDocument();
    });

    it('displays generic error when onSubmit throws', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => {
        throw new Error('Network failure');
      });
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.click(getSubmitButton());

      expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
    });

    it('clears submit error when user edits a field', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn(async () => ({ error: 'Server error' }));
      renderModal({ onSubmit });

      await fillRequiredFields(user);
      await user.click(getSubmitButton());
      expect(screen.getByText('Server error')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/product name/i), 'x');
      expect(screen.queryByText('Server error')).not.toBeInTheDocument();
    });
  });

  describe('close behavior', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderModal();

      await user.click(screen.getByLabelText(/close add item modal/i));
      expect(props.onClose).toHaveBeenCalled();
    });

    it('calls onClose when overlay is clicked', async () => {
      const user = userEvent.setup();
      const { props } = renderModal();

      await user.click(screen.getByTestId('add-item-overlay'));
      expect(props.onClose).toHaveBeenCalled();
    });

    it('does not close when clicking inside the modal', async () => {
      const user = userEvent.setup();
      const { props } = renderModal();

      await user.click(screen.getByRole('dialog'));
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('calls onClose on Escape key', async () => {
      const user = userEvent.setup();
      const { props } = renderModal();

      await user.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('submit button meets minimum tap target size', () => {
      renderModal();
      const btn = getSubmitButton();
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    });

    it('close button meets minimum tap target size', () => {
      renderModal();
      const btn = screen.getByLabelText(/close add item modal/i);
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    });

    it('inputs meet minimum tap target height', () => {
      renderModal();
      const nameInput = screen.getByLabelText(/product name/i);
      expect(parseInt(nameInput.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    });

    it('required fields have aria-required attribute', () => {
      renderModal();
      expect(screen.getByLabelText(/product name/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/category/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/expiration date/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/storage location/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/quantity/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^unit/i)).toHaveAttribute('aria-required', 'true');
    });
  });
});
