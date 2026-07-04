import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResizableSplit from '../ResizableSplit';

describe('ResizableSplit', () => {
  it('renders top and bottom panels', () => {
    render(
      <ResizableSplit top={<div>Top Content</div>} bottom={<div>Bottom Content</div>} />,
    );
    expect(screen.getByTestId('resizable-split-top')).toHaveTextContent('Top Content');
    expect(screen.getByTestId('resizable-split-bottom')).toHaveTextContent('Bottom Content');
  });

  it('renders the drag handle', () => {
    render(
      <ResizableSplit top={<div>Top</div>} bottom={<div>Bottom</div>} />,
    );
    const handle = screen.getByTestId('resizable-split-handle');
    expect(handle).toBeInTheDocument();
  });

  it('drag handle has minimum 44px touch target', () => {
    render(
      <ResizableSplit top={<div>Top</div>} bottom={<div>Bottom</div>} />,
    );
    const handle = screen.getByTestId('resizable-split-handle');
    expect(handle).toHaveStyle({ minHeight: '44px' });
  });

  it('handle has separator role with aria attributes', () => {
    render(
      <ResizableSplit top={<div>Top</div>} bottom={<div>Bottom</div>} />,
    );
    const handle = screen.getByRole('separator');
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
    expect(handle).toHaveAttribute('aria-label', 'Drag to resize panels');
    expect(handle).toHaveAttribute('aria-valuenow');
    expect(handle).toHaveAttribute('aria-valuemin');
    expect(handle).toHaveAttribute('aria-valuemax');
  });

  it('default ratio splits top panel at 60%', () => {
    render(
      <ResizableSplit top={<div>Top</div>} bottom={<div>Bottom</div>} />,
    );
    const topPanel = screen.getByTestId('resizable-split-top');
    // With default 0.6 ratio, flex-grow should be approximately 0.6
    const flexValue = parseFloat(topPanel.style.flex as string);
    expect(flexValue).toBeCloseTo(0.6, 1);
  });

  it('respects custom defaultRatio', () => {
    render(
      <ResizableSplit
        top={<div>Top</div>}
        bottom={<div>Bottom</div>}
        defaultRatio={0.7}
      />,
    );
    const topPanel = screen.getByTestId('resizable-split-top');
    const flexValue = parseFloat(topPanel.style.flex as string);
    expect(flexValue).toBeCloseTo(0.7, 1);
  });

  it('container uses flex column layout', () => {
    render(
      <ResizableSplit top={<div>Top</div>} bottom={<div>Bottom</div>} />,
    );
    const container = screen.getByTestId('resizable-split');
    expect(container).toHaveStyle({ display: 'flex', flexDirection: 'column' });
  });
});
