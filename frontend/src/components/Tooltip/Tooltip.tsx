import React, { useId, useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom';
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(e);
    },
    'aria-describedby': id,
  });

  const isTop = position === 'top';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {child}
      <div
        id={id}
        role="tooltip"
        style={{
          position: 'absolute',
          [isTop ? 'bottom' : 'top']: 'calc(100% + 8px)',
          left: '50%',
          transform: visible
            ? 'translateX(-50%) scale(1) translateY(0)'
            : `translateX(-50%) scale(0.88) translateY(${isTop ? '4px' : '-4px'})`,
          opacity: visible ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 0.16s ease, transform 0.2s var(--inv-spring, cubic-bezier(0.34,1.56,0.64,1))',
          backgroundColor: '#4a3f3a',
          color: '#fffaf8',
          borderRadius: 10,
          fontSize: '0.75rem',
          padding: '6px 10px',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(74, 63, 58, 0.25)',
          zIndex: 50,
          maxWidth: '90vw',
        }}
      >
        {content}
      </div>
    </div>
  );
};

export default Tooltip;
