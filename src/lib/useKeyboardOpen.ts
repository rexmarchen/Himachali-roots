import { useEffect, useRef, useState } from 'react';

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'tel', 'url', 'password', 'number']);

function isTextEntryElement(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Detects when an on-screen software keyboard is likely open on mobile Android/iOS.
 * Works across both `interactive-widget=resizes-content` (where innerHeight and
 * visualViewport.height shrink together) and legacy `resizes-visual` viewports.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  const baselineRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const getSize = () => ({
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    });

    const evaluate = () => {
      if (window.innerWidth >= 768) {
        setOpen(false);
        return;
      }
      const { width, height } = getSize();
      const focused = isTextEntryElement(document.activeElement);

      if (!baselineRef.current || Math.abs(baselineRef.current.width - width) > 24) {
        baselineRef.current = { width, height };
      } else if (!focused && height > baselineRef.current.height) {
        baselineRef.current.height = height;
      }

      const shrankFromBaseline = baselineRef.current.height - height > 120;
      const shrankVisual = window.visualViewport
        ? window.innerHeight - window.visualViewport.height > 120
        : false;

      setOpen(focused || shrankFromBaseline || shrankVisual);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocusChange = () => {
      clearTimeout(timer);
      evaluate();
      // Android browsers often resize the viewport 50-200ms after focusin/focusout.
      timer = setTimeout(evaluate, 160);
    };

    evaluate();
    window.addEventListener('focusin', onFocusChange);
    window.addEventListener('focusout', onFocusChange);
    window.addEventListener('resize', evaluate, { passive: true });
    window.visualViewport?.addEventListener('resize', evaluate);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focusin', onFocusChange);
      window.removeEventListener('focusout', onFocusChange);
      window.removeEventListener('resize', evaluate);
      window.visualViewport?.removeEventListener('resize', evaluate);
    };
  }, []);

  return open;
}
