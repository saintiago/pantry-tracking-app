import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StorageLocationManager, {
  StorageLocation,
  StorageLocationManagerProps,
} from '../StorageLocationManager';

const makeLocation = (id: string, name: string, createdAt?: string): StorageLocation => ({
  locationId: id,
  name,
  createdAt: createdAt ?? new Date().toISOString(),
});

const defaultLocations: StorageLocation[] = [
  makeLocation('loc-1', 'Pantry', '2024-01-01T00:00:00Z'),
  makeLocation('loc-2', 'Fridge', '2024-01-02T00:00:00Z'),
];

const noopAsync = async () => ({});

const renderManager = (overrides: Partial<StorageLocationManagerProps> = {}) => {
  const props: StorageLocationManagerProps = {
    locations: defaultLocations,
    onAdd: jest.fn(noopAsync),
    onRename: jest.fn(noopAsync),
    onRemove: jest.fn(noopAsync),
    ...overrides,
  };
  const result = render(<StorageLocationManager {...props} />);
  return { ...result, props };
};

describe('StorageLocationManager', () => {
  describe('rendering', () => {
    it('displays the heading', () => {
      renderManager();
      expect(screen.getByText('Storage Locations')).toBeInTheDocument();
    });

    it('displays all locations in order', () => {
      renderManager();
      const list = screen.getByRole('list', { name: /locations list/i });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Pantry');
      expect(items[1]).toHaveTextContent('Fridge');
    });

    it('has an add location input and button', () => {
      renderManager();
      expect(screen.getByLabelText('New location name')).toBeInTheDocument();
      expect(screen.getByLabelText('Add location')).toBeInTheDocument();
    });
  });

  describe('adding a location', () => {
    it('calls onAdd with trimmed name when clicking Add', async () => {
      const user = userEvent.setup();
      const { props } = renderManager();

      await user.type(screen.getByLabelText('New location name'), '  Freezer  ');
      await user.click(screen.getByLabelText('Add location'));

      expect(props.onAdd).toHaveBeenCalledWith('Freezer');
    });

    it('clears the input after successful add', async () => {
      const user = userEvent.setup();
      renderManager();

      const input = screen.getByLabelText('New location name') as HTMLInputElement;
      await user.type(input, 'Freezer');
      await user.click(screen.getByLabelText('Add location'));

      expect(input.value).toBe('');
    });

    it('calls onAdd when pressing Enter', async () => {
      const user = userEvent.setup();
      const { props } = renderManager();

      await user.type(screen.getByLabelText('New location name'), 'Freezer{Enter}');
      expect(props.onAdd).toHaveBeenCalledWith('Freezer');
    });

    it('shows error for empty name', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Add location'));
      expect(screen.getByRole('alert')).toHaveTextContent('Location name cannot be empty.');
    });

    it('shows error for duplicate name (case-insensitive)', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.type(screen.getByLabelText('New location name'), 'pantry');
      await user.click(screen.getByLabelText('Add location'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'A location with this name already exists.',
      );
    });

    it('shows backend error from onAdd', async () => {
      const user = userEvent.setup();
      const onAdd = jest.fn(async () => ({ error: 'Server error' }));
      renderManager({ onAdd });

      await user.type(screen.getByLabelText('New location name'), 'Garage');
      await user.click(screen.getByLabelText('Add location'));

      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });

    it('clears add error when typing', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Add location'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      await user.type(screen.getByLabelText('New location name'), 'a');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('renaming a location', () => {
    it('enters edit mode when clicking Rename', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      expect(screen.getByLabelText('Rename Pantry')).toHaveValue('Pantry');
      expect(screen.getByLabelText('Save rename')).toBeInTheDocument();
      expect(screen.getByLabelText('Cancel rename')).toBeInTheDocument();
    });

    it('calls onRename with new name on Save', async () => {
      const user = userEvent.setup();
      const { props } = renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      const input = screen.getByLabelText('Rename Pantry');
      await user.clear(input);
      await user.type(input, 'Kitchen');
      await user.click(screen.getByLabelText('Save rename'));

      expect(props.onRename).toHaveBeenCalledWith('loc-1', 'Kitchen');
    });

    it('calls onRename when pressing Enter', async () => {
      const user = userEvent.setup();
      const { props } = renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      const input = screen.getByLabelText('Rename Pantry');
      await user.clear(input);
      await user.type(input, 'Kitchen{Enter}');

      expect(props.onRename).toHaveBeenCalledWith('loc-1', 'Kitchen');
    });

    it('cancels editing on Cancel click', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      await user.click(screen.getByLabelText('Cancel rename'));

      expect(screen.queryByLabelText('Save rename')).not.toBeInTheDocument();
      expect(screen.getByText('Pantry')).toBeInTheDocument();
    });

    it('cancels editing on Escape key', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      await user.keyboard('{Escape}');

      expect(screen.queryByLabelText('Save rename')).not.toBeInTheDocument();
    });

    it('shows error for duplicate rename (case-insensitive)', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      const input = screen.getByLabelText('Rename Pantry');
      await user.clear(input);
      await user.type(input, 'fridge');
      await user.click(screen.getByLabelText('Save rename'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'A location with this name already exists.',
      );
    });

    it('shows error for empty rename', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Rename Pantry'));
      const input = screen.getByLabelText('Rename Pantry');
      await user.clear(input);
      await user.click(screen.getByLabelText('Save rename'));

      expect(screen.getByRole('alert')).toHaveTextContent('Location name cannot be empty.');
    });

    it('shows backend error from onRename', async () => {
      const user = userEvent.setup();
      const onRename = jest.fn(async () => ({ error: 'Rename failed' }));
      renderManager({ onRename });

      await user.click(screen.getByLabelText('Rename Pantry'));
      const input = screen.getByLabelText('Rename Pantry');
      await user.clear(input);
      await user.type(input, 'Kitchen');
      await user.click(screen.getByLabelText('Save rename'));

      expect(screen.getByRole('alert')).toHaveTextContent('Rename failed');
    });
  });

  describe('deleting a location', () => {
    it('shows confirmation when clicking Delete', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Delete Pantry'));
      expect(screen.getByText(/Delete "Pantry"\?/)).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm delete Pantry')).toBeInTheDocument();
      expect(screen.getByLabelText('Cancel delete')).toBeInTheDocument();
    });

    it('calls onRemove when confirming delete', async () => {
      const user = userEvent.setup();
      const { props } = renderManager();

      await user.click(screen.getByLabelText('Delete Pantry'));
      await user.click(screen.getByLabelText('Confirm delete Pantry'));

      expect(props.onRemove).toHaveBeenCalledWith('loc-1');
    });

    it('cancels delete on No click', async () => {
      const user = userEvent.setup();
      renderManager();

      await user.click(screen.getByLabelText('Delete Pantry'));
      await user.click(screen.getByLabelText('Cancel delete'));

      expect(screen.queryByText(/Delete "Pantry"\?/)).not.toBeInTheDocument();
      expect(screen.getByText('Pantry')).toBeInTheDocument();
    });

    it('shows backend error from onRemove (non-empty location)', async () => {
      const user = userEvent.setup();
      const onRemove = jest.fn(async () => ({
        error: 'Cannot remove location that contains items.',
      }));
      renderManager({ onRemove });

      await user.click(screen.getByLabelText('Delete Fridge'));
      await user.click(screen.getByLabelText('Confirm delete Fridge'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot remove location that contains items.',
      );
    });

    it('shows backend error for last location removal', async () => {
      const user = userEvent.setup();
      const singleLocation = [makeLocation('loc-1', 'Pantry')];
      const onRemove = jest.fn(async () => ({
        error: 'Cannot remove the last storage location.',
      }));
      renderManager({ locations: singleLocation, onRemove });

      await user.click(screen.getByLabelText('Delete Pantry'));
      await user.click(screen.getByLabelText('Confirm delete Pantry'));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot remove the last storage location.',
      );
    });
  });

  describe('accessibility', () => {
    it('has an accessible section landmark', () => {
      renderManager();
      expect(screen.getByRole('region', { name: /storage locations/i })).toBeInTheDocument();
    });

    it('add button meets minimum tap target size', () => {
      renderManager();
      const btn = screen.getByLabelText('Add location');
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    });

    it('action buttons meet minimum tap target size', () => {
      renderManager();
      const renameBtn = screen.getByLabelText('Rename Pantry');
      expect(parseInt(renameBtn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(renameBtn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    });

    it('input meets minimum tap target height', () => {
      renderManager();
      const input = screen.getByLabelText('New location name');
      expect(parseInt(input.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    });
  });
});
