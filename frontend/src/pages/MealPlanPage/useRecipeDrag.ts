import { useEffect, useRef, useState } from 'react';
import type { Assignment } from './weekUtils';
export interface Drag {
  recipeId: string;
  name: string;
  x: number;
  y: number;
  target: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  selected: boolean;
}
interface Gesture extends Drag {
  originX: number;
  originY: number;
  dragging: boolean;
  element: HTMLElement;
  pointerId?: number;
  touchId?: number;
}
/** Mouse/pen threshold and touch hold share one cancellation-safe drop controller. */
export function useRecipeDrag(
  onDrop: (id: string, date: string, meal: Assignment['mealType']) => void,
  onRemove?: (id: string) => void,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const callbacks = useRef({ onDrop, onRemove });
  callbacks.current = { onDrop, onRemove };
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppress = useRef(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const targetAt = (x: number, y: number) => {
      const target = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>('[data-meal-date], [data-remove-drop]');
      return target && root.contains(target) && target.dataset.dropDisabled !== 'true'
        ? target
        : null;
    };
    const update = () => {
      const gesture = gestureRef.current;
      if (!gesture?.dragging) return;
      const target = targetAt(gesture.x, gesture.y);
      gesture.target = target?.hasAttribute('data-remove-drop')
        ? 'remove'
        : target
          ? `${target.dataset.mealDate}/${target.dataset.mealType}`
          : '';
      setDrag({ ...gesture });
    };
    const cancel = () => {
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.dragging) suppress.current = true;
      if (gesture?.pointerId !== undefined && gesture.element.hasPointerCapture(gesture.pointerId))
        gesture.element.releasePointerCapture(gesture.pointerId);
      setDrag(null);
    };
    const scroll = () => {
      const gesture = gestureRef.current;
      if (!gesture?.dragging) return;
      const speed = gesture.y < 85 ? -12 : gesture.y > window.innerHeight - 105 ? 12 : 0;
      if (speed) {
        window.scrollBy(0, speed);
        const main = root.closest('main');
        if (main) main.scrollTop += speed;
      }
      for (const element of root.querySelectorAll<HTMLElement>(
        '[data-meal-calendar], [data-recipe-library]',
      )) {
        const rect = element.getBoundingClientRect();
        if (
          gesture.x >= rect.left &&
          gesture.x <= rect.right &&
          gesture.y >= rect.top &&
          gesture.y <= rect.bottom
        ) {
          if (element.hasAttribute('data-meal-calendar')) {
            if (gesture.x < rect.left + 30) element.scrollLeft -= 10;
            if (gesture.x > rect.right - 30) element.scrollLeft += 10;
          } else {
            if (gesture.y < rect.top + 35) element.scrollTop -= 10;
            if (gesture.y > rect.bottom - 35) element.scrollTop += 10;
          }
        }
      }
      update();
      frame = requestAnimationFrame(scroll);
    };
    const begin = (target: EventTarget | null, x: number, y: number) => {
      if (!(target instanceof Element) || target.closest('[data-no-drag]')) return null;
      const surface = target.closest<HTMLElement>('[data-drag-id]');
      if (
        !surface ||
        !root.contains(surface) ||
        surface.getAttribute('aria-disabled') === 'true' ||
        surface.matches(':disabled')
      )
        return null;
      const bounds = (
        surface.closest<HTMLElement>('[data-recipe-row]') ?? surface
      ).getBoundingClientRect();
      suppress.current = false;
      const gesture: Gesture = {
        recipeId: surface.dataset.dragId!,
        name: surface.dataset.dragName ?? surface.textContent ?? '',
        x,
        y,
        originX: x,
        originY: y,
        offsetX: x - bounds.left,
        offsetY: y - bounds.top,
        width: bounds.width,
        height: bounds.height,
        target: '',
        selected: false,
        dragging: false,
        element: surface,
      };
      gestureRef.current = gesture;
      return gesture;
    };
    const activate = (gesture: Gesture) => {
      gesture.dragging = true;
      update();
      frame = requestAnimationFrame(scroll);
    };
    const finish = (x: number, y: number) => {
      const gesture = gestureRef.current;
      const target = gesture?.dragging ? targetAt(x, y) : null;
      cancel();
      if (!gesture || !target) return;
      if (target.hasAttribute('data-remove-drop')) {
        if (gesture.recipeId.startsWith('plan:'))
          callbacks.current.onRemove?.(gesture.recipeId.slice(5));
      } else
        callbacks.current.onDrop(
          gesture.recipeId,
          target.dataset.mealDate!,
          target.dataset.mealType as Assignment['mealType'],
        );
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
      suppress.current = false;
      const gesture = begin(event.target, event.clientX, event.clientY);
      if (gesture) {
        gesture.pointerId = event.pointerId;
        gesture.element.setPointerCapture(event.pointerId);
      }
    };
    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (
        !gesture.dragging &&
        Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) >= 6
      )
        activate(gesture);
      if (gesture.dragging) {
        event.preventDefault();
        update();
      }
    };
    const up = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) finish(event.clientX, event.clientY);
    };
    const touchStart = (event: TouchEvent) => {
      suppress.current = false;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }
      const touch = event.touches[0];
      const gesture = begin(event.target, touch.clientX, touch.clientY);
      if (gesture) {
        gesture.touchId = touch.identifier;
        hold = setTimeout(() => activate(gesture), 350);
      }
    };
    const touchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.touchId === undefined) return;
      const touch = Array.from(event.touches).find((t) => t.identifier === gesture.touchId);
      if (!touch) {
        cancel();
        return;
      }
      gesture.x = touch.clientX;
      gesture.y = touch.clientY;
      if (
        !gesture.dragging &&
        Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) > 8
      ) {
        cancel();
        return;
      }
      if (gesture.dragging) {
        event.preventDefault();
        update();
      }
    };
    const touchEnd = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (gesture?.touchId === undefined) return;
      const touch = Array.from(event.changedTouches).find((t) => t.identifier === gesture.touchId);
      if (touch) {
        if (gesture.dragging) event.preventDefault();
        finish(touch.clientX, touch.clientY);
      }
    };
    const click = (event: MouseEvent) => {
      if (suppress.current && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
        suppress.current = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const nativeDrag = (event: Event) => event.preventDefault();
    root.addEventListener('pointerdown', down);
    root.addEventListener('touchstart', touchStart, { passive: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', touchEnd, { passive: false });
    window.addEventListener('touchcancel', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    root.addEventListener('click', click, true);
    root.addEventListener('dragstart', nativeDrag);
    return () => {
      cancel();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('touchstart', touchStart);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      root.removeEventListener('click', click, true);
      root.removeEventListener('dragstart', nativeDrag);
    };
  }, []);
  return { rootRef, drag };
}
