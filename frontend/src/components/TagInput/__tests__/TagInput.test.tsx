import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import TagInput from '../TagInput';

const defaultProps = {
  tags: [],
  onChange: jest.fn(),
  allTags: ['italian', 'quick', 'soup', 'vegetarian', 'dessert'],
  tagsLoading: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TagInput', () => {
  it('renders chips for each tag in tags prop', () => {
    render(<TagInput {...defaultProps} tags={['italian', 'quick']} />);
    expect(screen.getByText('italian')).toBeInTheDocument();
    expect(screen.getByText('quick')).toBeInTheDocument();
  });

  it('pressing Enter commits trimmed+lowercased input as a chip', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'PASTA');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['pasta']);
  });

  it('pressing comma commits input as a chip', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'pasta');
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['pasta']);
  });

  it('pressing semicolon commits input as a chip', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'pasta');
    fireEvent.keyDown(input, { key: ';' });
    expect(onChange).toHaveBeenCalledWith(['pasta']);
  });

  it('pressing period commits input as a chip', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'pasta');
    fireEvent.keyDown(input, { key: '.' });
    expect(onChange).toHaveBeenCalledWith(['pasta']);
  });

  it('pressing Escape closes autocomplete without committing', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    // Dropdown should be open (allTags not in tags)
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking a suggestion commits that tag and clears the input', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    const option = screen.getByRole('option', { name: 'italian' });
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenCalledWith(['italian']);
  });

  it('clicking the remove button removes that tag', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} tags={['italian', 'quick']} onChange={onChange} />);
    const removeBtn = screen.getByRole('button', { name: 'Remove tag italian' });
    await userEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['quick']);
  });

  it('remove button has aria-label="Remove tag {tagName}"', () => {
    render(<TagInput {...defaultProps} tags={['italian']} />);
    expect(screen.getByRole('button', { name: 'Remove tag italian' })).toBeInTheDocument();
  });

  it('duplicate input is silently discarded', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} tags={['italian']} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'italian');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('empty/whitespace input is not committed', async () => {
    const onChange = jest.fn();
    render(<TagInput {...defaultProps} onChange={onChange} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, '   ');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('on focus, autocomplete shows allTags not in tags (up to 10)', async () => {
    render(<TagInput {...defaultProps} tags={['italian']} />);
    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    // 'italian' is already in tags, so it should not appear in suggestions
    expect(screen.queryByRole('option', { name: 'italian' })).not.toBeInTheDocument();
    // Others should appear
    expect(screen.getByRole('option', { name: 'quick' })).toBeInTheDocument();
  });

  it('error message is rendered when error prop is set', () => {
    render(<TagInput {...defaultProps} error="At least one tag is required." />);
    expect(screen.getByText('At least one tag is required.')).toBeInTheDocument();
  });

  it('when tagsLoading is true, autocomplete does not open and placeholder shows "Loading tags…"', async () => {
    render(<TagInput {...defaultProps} tagsLoading={true} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', 'Loading tags…');
    await userEvent.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  describe('keyboard navigation', () => {
    it('ArrowDown moves the highlight forward and wraps from last to first', async () => {
      render(<TagInput {...defaultProps} allTags={['a', 'b', 'c']} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      // initial: nothing highlighted
      expect(input).not.toHaveAttribute('aria-activedescendant');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: 'a' })).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: 'b' })).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: 'c' })).toHaveAttribute('aria-selected', 'true');

      // wraps back to first
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: 'a' })).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowUp moves the highlight backward and wraps from first to last', async () => {
      render(<TagInput {...defaultProps} allTags={['a', 'b', 'c']} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);

      // First ArrowUp from -1 wraps to last item
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByRole('option', { name: 'c' })).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByRole('option', { name: 'b' })).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByRole('option', { name: 'a' })).toHaveAttribute('aria-selected', 'true');

      // wraps to last again
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(screen.getByRole('option', { name: 'c' })).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowDown opens the dropdown and highlights first if it was closed', () => {
      render(<TagInput {...defaultProps} allTags={['a', 'b']} />);
      const input = screen.getByRole('combobox');
      // Dropdown starts closed (no focus)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'a' })).toHaveAttribute('aria-selected', 'true');
    });

    it('Tab commits the highlighted suggestion when one is highlighted', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight 'italian'
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight 'quick'
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(onChange).toHaveBeenCalledWith(['quick']);
    });

    it('Tab commits the first suggestion when none is highlighted', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      // No ArrowDown — nothing highlighted
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(onChange).toHaveBeenCalledWith(['italian']);
    });

    it('Tab does not commit and allows default focus shift when dropdown is closed', () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      // Don't focus — dropdown stays closed
      const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });
      input.dispatchEvent(event);
      expect(onChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('Tab does not commit when dropdown is open but suggestions are empty', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={[]} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      // No suggestions → dropdown not actually rendered
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Enter commits the highlighted suggestion when one is highlighted', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight 'italian'
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(['italian']);
    });

    it('Enter commits the typed inputValue (not the first suggestion) when nothing is highlighted', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.type(input, 'pasta');
      // No ArrowDown — nothing highlighted, even though the dropdown is open
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(['pasta']);
    });

    it('typing after highlighting a suggestion resets the highlight so Enter commits the typed text', async () => {
      const onChange = jest.fn();
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} onChange={onChange} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight 'italian'
      // Now type — highlight should reset
      await userEvent.type(input, 'pasta');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(['pasta']);
    });

    it('input has aria-activedescendant pointing to the highlighted option id', async () => {
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      expect(input).not.toHaveAttribute('aria-activedescendant');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const option = screen.getByRole('option', { name: 'italian' });
      expect(option.id).toBeTruthy();
      expect(input).toHaveAttribute('aria-activedescendant', option.id);
    });

    it('Escape resets the highlight and closes the dropdown', async () => {
      render(<TagInput {...defaultProps} allTags={['italian', 'quick']} />);
      const input = screen.getByRole('combobox');
      await userEvent.click(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input).toHaveAttribute('aria-activedescendant');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input).not.toHaveAttribute('aria-activedescendant');
    });
  });
});
