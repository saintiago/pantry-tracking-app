import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../SettingsPage';
jest.mock('../../../api/locations/locations');
import {
  fetchLocations,
  createLocation,
  renameLocation,
  deleteLocation,
} from '../../../api/locations/locations';
const mockFetchLocations = jest.mocked(fetchLocations);
const mockCreateLocation = jest.mocked(createLocation);
const mockRenameLocation = jest.mocked(renameLocation);
const mockDeleteLocation = jest.mocked(deleteLocation);
const defaultLocations = [
  { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
];
beforeEach(() => jest.resetAllMocks());
function setupDefaults() {
  mockFetchLocations.mockResolvedValue(defaultLocations);
}
describe('Settings location management', () => {
  it('adds a location and refreshes the list', async () => {
    setupDefaults();
    mockFetchLocations
      .mockResolvedValueOnce(defaultLocations)
      .mockResolvedValueOnce([
        ...defaultLocations,
        { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
      ]);

    mockCreateLocation.mockResolvedValue({
      locationId: 'loc-2',
      name: 'Fridge',
      createdAt: '2024-01-02T00:00:00Z',
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Add location')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New location name');
    await userEvent.type(input, 'Fridge');
    await userEvent.click(screen.getByLabelText('Add location'));

    expect(mockCreateLocation).toHaveBeenCalledWith('Fridge', '#E3F0D5');

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Fridge')).toBeInTheDocument();
    });
  });

  it('shows error from API when add fails with duplicate name', async () => {
    setupDefaults();

    mockCreateLocation.mockRejectedValue(
      new Error('A storage location with this name already exists'),
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Add location')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('New location name');
    await userEvent.type(input, 'NewPlace');
    await userEvent.click(screen.getByLabelText('Add location'));

    await waitFor(() => {
      expect(
        screen.getByText('A storage location with this name already exists'),
      ).toBeInTheDocument();
    });
  });

  it('renames a location and refreshes the list', async () => {
    setupDefaults();
    mockFetchLocations
      .mockResolvedValueOnce(defaultLocations)
      .mockResolvedValueOnce([
        { locationId: 'loc-1', name: 'Kitchen', createdAt: '2024-01-01T00:00:00Z' },
      ]);

    mockRenameLocation.mockResolvedValue({
      locationId: 'loc-1',
      name: 'Kitchen',
      createdAt: '2024-01-01T00:00:00Z',
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Rename Pantry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Rename Pantry'));

    const renameInput = screen.getByLabelText('Rename Pantry');
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, 'Kitchen');
    await userEvent.click(screen.getByLabelText('Save rename'));

    expect(mockRenameLocation).toHaveBeenCalledWith('loc-1', 'Kitchen', '#E3F0D5');

    await waitFor(() => {
      expect(screen.getByLabelText('Rename Kitchen')).toBeInTheDocument();
    });
  });

  it('removes a location after confirmation and refreshes the list', async () => {
    mockFetchLocations
      .mockResolvedValueOnce([
        ...defaultLocations,
        { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
      ])
      .mockResolvedValueOnce(defaultLocations);

    mockDeleteLocation.mockResolvedValue(undefined);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Fridge')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Delete Fridge'));
    await userEvent.click(screen.getByLabelText('Confirm delete Fridge'));

    expect(mockDeleteLocation).toHaveBeenCalledWith('loc-2');

    await waitFor(() => {
      expect(screen.queryByLabelText('Delete Fridge')).not.toBeInTheDocument();
    });
  });

  it('shows error when removing last location', async () => {
    setupDefaults();

    mockDeleteLocation.mockRejectedValue(
      new Error('Cannot remove the last remaining storage location'),
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Delete Pantry')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText('Delete Pantry'));
    await userEvent.click(screen.getByLabelText('Confirm delete Pantry'));

    await waitFor(() => {
      expect(
        screen.getByText('Cannot remove the last remaining storage location'),
      ).toBeInTheDocument();
    });
  });
});

test('retry after a successful write with failed refresh only reloads; it does not create twice', async () => {
  mockFetchLocations
    .mockResolvedValueOnce(defaultLocations)
    .mockRejectedValueOnce(new Error('Refresh failed'))
    .mockResolvedValueOnce([
      ...defaultLocations,
      { locationId: 'new', name: 'Garage', createdAt: '' },
    ]);
  mockCreateLocation.mockResolvedValue({ locationId: 'new', name: 'Garage', createdAt: '' });
  render(<SettingsPage />);
  await userEvent.type(await screen.findByLabelText('New location name'), 'Garage');
  await userEvent.click(screen.getByLabelText('Add location'));
  await screen.findByText('Refresh failed');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByLabelText('Delete Garage');
  expect(mockCreateLocation).toHaveBeenCalledTimes(1);
});
