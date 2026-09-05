import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Assignment } from './weekUtils';

interface Drag {
  recipeId: string;
  name: string;
  x: number;
  y: number;
  target: string;
}

interface Gesture extends Drag {
  pointerId: number;
  originX: number;
  originY: number;
  dragging: boolean;
  element: HTMLButtonElement;
}

/** A single pointer gesture owns placement; native HTML dragging is disabled. */
export function useRecipeDrag(
  onDrop: (recipeId: string, date: string, mealType: Assignment['mealType']) => void,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  const findTarget = (x: number, y: number) => {
    const button = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-meal-date]');
    return button && button.dataset.dropDisabled !== 'true' && rootRef.current?.contains(button)
      ? button
      : null;
  };

  const updateTarget = (gesture: Gesture) => {
    const button = findTarget(gesture.x, gesture.y);
    gesture.target = button ? `${button.dataset.mealDate}/${button.dataset.mealType}` : '';
    setDrag({ ...gesture });
  };

  const cancel = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.dragging) suppressClickRef.current = true;
    if (gesture?.element.hasPointerCapture(gesture.pointerId)) {
      gesture.element.releasePointerCapture(gesture.pointerId);
    }
    setDrag(null);
  };

  // Keep scrolling during a held drag so lower dates and horizontally hidden days
  // remain reachable without releasing the mouse. Respect fixed header/navigation.
  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const tick = () => {
      const gesture = gestureRef.current;
      if (!gesture?.dragging) return;
      const beforeY = window.scrollY;
      const speed = gesture.y < 85 ? -12 : gesture.y > window.innerHeight - 105 ? 12 : 0;
      if (speed) window.scrollBy(0, speed);
      let scrolled = beforeY !== window.scrollY;
      const calendar = rootRef.current?.querySelector<HTMLElement>('[data-meal-calendar]');
      if (calendar) {
        const bounds = calendar.getBoundingClientRect();
        if (gesture.y >= bounds.top && gesture.y <= bounds.bottom) {
          const beforeX = calendar.scrollLeft;
          if (gesture.x < bounds.left + 30) calendar.scrollLeft -= 10;
          else if (gesture.x > bounds.right - 30) calendar.scrollLeft += 10;
          scrolled ||= beforeX !== calendar.scrollLeft;
        }
      }
      if (scrolled) updateTarget(gesture);
      frame = requestAnimationFrame(tick);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
    };
  }, [Boolean(drag)]);

  return {
    rootRef,
    drag,
    consumeDragClick: () => {
      const suppress = suppressClickRef.current;
      suppressClickRef.current = false;
      return suppress;
    },
    start: (event: ReactPointerEvent<HTMLButtonElement>, recipeId: string, name: string) => {
      if (!event.isPrimary || event.button !== 0 || event.currentTarget.disabled) return;
      suppressClickRef.current = false;
      // Touch keeps native list scrolling and tap-to-place. Mouse/pen own dragging.
      if (event.pointerType === 'touch') return;
      gestureRef.current = {
        recipeId,
        name,
        x: event.clientX,
        y: event.clientY,
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId,
        target: '',
        dragging: false,
        element: event.currentTarget,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    move: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (
        !gesture.dragging &&
        Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) < 6
      )
        return;
      gesture.dragging = true;
      event.preventDefault();
      updateTarget(gesture);
    },
    end: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const target = gesture.dragging ? findTarget(event.clientX, event.clientY) : null;
      cancel();
      if (target)
        onDrop(
          gesture.recipeId,
          target.dataset.mealDate!,
          target.dataset.mealType as Assignment['mealType'],
        );
    },
    cancel,
  };
}
