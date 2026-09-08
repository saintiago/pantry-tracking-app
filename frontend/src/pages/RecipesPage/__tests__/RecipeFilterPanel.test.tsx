import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeFilterPanel, { EMPTY_PANEL_VALUE, isAllInactive } from '../RecipeFilterPanel';
import { timeStops } from '../RecipeTimeSlider';
import type { Recipe } from '../../../api/recipes/recipes';
function Fixture() {
  const [value, setValue] = useState(EMPTY_PANEL_VALUE);
  return (
    <RecipeFilterPanel
      value={value}
      onChange={setValue}
      isAllInactive={isAllInactive(value)}
      onClear={() => setValue(EMPTY_PANEL_VALUE)}
      recipes={
        [
          { prepTime: 40, cookTime: 20 },
          { prepTime: 10, cookTime: 5 },
          { prepTime: 40 },
        ] as Recipe[]
      }
    />
  );
}
test('time stops are distinct actual recipe times, including zero and excluding unknown', () =>
  expect(timeStops([40, undefined, 10, 40, 0])).toEqual([0, 10, 40]));
test('time sliders snap to existing durations and clear back to unrestricted', () => {
  render(<Fixture />);
  const prep = screen.getByRole('slider', { name: 'Max prep time (min)' });
  expect(prep).toHaveAttribute('aria-valuetext', 'Any time');
  fireEvent.change(prep, { target: { value: '0' } });
  expect(prep).toHaveAttribute('aria-valuetext', '10 min');
  fireEvent.change(prep, { target: { value: '1' } });
  expect(prep).toHaveAttribute('aria-valuetext', '40 min');
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(prep).toHaveAttribute('aria-valuetext', 'Any time');
});
test('no recorded times disables the slider; availability and expiry still compose', () => {
  render(
    <RecipeFilterPanel
      value={EMPTY_PANEL_VALUE}
      onChange={jest.fn()}
      isAllInactive
      onClear={jest.fn()}
    />,
  );
  expect(screen.getByRole('slider', { name: 'Max prep time (min)' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Only recipes I can make now' })).toBeEnabled();
  expect(screen.getByRole('checkbox', { name: 'Ingredients expiring soon' })).toBeEnabled();
});
