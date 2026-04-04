import { useState, useCallback, useEffect, useRef } from "react";

interface UseKeyboardNavResult {
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  isFocused: (index: number) => boolean;
}

/**
 * Hook for keyboard navigation across a list of focusable items (e.g., article cards).
 *
 * - Arrow Up/Down moves focus between items.
 * - Enter activates (expands/opens) the currently focused item via `onSelect`.
 * - Escape deactivates (collapses) the expanded item via `onDeselect` and clears focus.
 * - Tab is left to the browser's default focus management.
 *
 * Pair with `isFocused(index)` to apply `ring-2 ring-blue-500` styling on each card.
 */
export function useKeyboardNav(
  itemCount: number,
  options?: {
    onSelect?: (index: number) => void;
    onDeselect?: () => void;
  },
): UseKeyboardNavResult {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<boolean>(false);

  // Reset focused index if the item count shrinks below the current index.
  useEffect(() => {
    if (focusedIndex >= itemCount) {
      setFocusedIndex(itemCount > 0 ? itemCount - 1 : -1);
    }
  }, [itemCount, focusedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (itemCount === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < itemCount - 1 ? prev + 1 : 0;
            scrollItemIntoView(next);
            return next;
          });
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : itemCount - 1;
            scrollItemIntoView(next);
            return next;
          });
          break;
        }

        case "Enter": {
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            e.preventDefault();
            options?.onSelect?.(focusedIndex);
          }
          break;
        }

        case "Escape": {
          e.preventDefault();
          options?.onDeselect?.();
          setFocusedIndex(-1);
          break;
        }

        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          scrollItemIntoView(0);
          break;
        }

        case "End": {
          e.preventDefault();
          const last = itemCount - 1;
          setFocusedIndex(last);
          scrollItemIntoView(last);
          break;
        }

        default:
          break;
      }
    },
    [itemCount, focusedIndex, options],
  );

  const isFocused = useCallback(
    (index: number) => focusedIndex === index,
    [focusedIndex],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
    isFocused,
  };
}

/**
 * Scrolls the article card element at the given index into view.
 * Expects cards to carry `data-card-index` attributes.
 */
function scrollItemIntoView(index: number): void {
  // Use requestAnimationFrame to allow React to update state first.
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-card-index="${index}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  });
}

export default useKeyboardNav;
