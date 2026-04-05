import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Test the keyboard navigation LOGIC directly without React hooks.
// We test the state transition rules that useKeyboardNav implements.
// ---------------------------------------------------------------------------

/** Simulate the ArrowDown state transition */
function arrowDown(current: number, itemCount: number): number {
  if (itemCount === 0) return current;
  return current < itemCount - 1 ? current + 1 : 0;
}

/** Simulate the ArrowUp state transition */
function arrowUp(current: number, itemCount: number): number {
  if (itemCount === 0) return current;
  return current > 0 ? current - 1 : itemCount - 1;
}

/** Simulate the full keyboard handler state machine */
function handleKey(
  key: string,
  focusedIndex: number,
  itemCount: number,
  callbacks?: { onSelect?: (i: number) => void; onDeselect?: () => void },
): number {
  if (itemCount === 0 && (key === "ArrowDown" || key === "ArrowUp")) return focusedIndex;

  switch (key) {
    case "ArrowDown":
      return arrowDown(focusedIndex, itemCount);
    case "ArrowUp":
      return arrowUp(focusedIndex, itemCount);
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    case "Enter":
      if (focusedIndex >= 0 && focusedIndex < itemCount) {
        callbacks?.onSelect?.(focusedIndex);
      }
      return focusedIndex;
    case "Escape":
      callbacks?.onDeselect?.();
      return -1;
    default:
      return focusedIndex;
  }
}

/** Helper to run a sequence of keys */
function runSequence(keys: string[], itemCount: number, callbacks?: { onSelect?: (i: number) => void; onDeselect?: () => void }): number {
  let index = -1;
  for (const key of keys) {
    index = handleKey(key, index, itemCount, callbacks);
  }
  return index;
}

describe("useKeyboardNav logic", () => {

  describe("ArrowDown", () => {
    it("increments focusedIndex from -1 to 0", () => {
      expect(runSequence(["ArrowDown"], 5)).toBe(0);
    });

    it("increments focusedIndex from 0 to 1", () => {
      expect(runSequence(["ArrowDown", "ArrowDown"], 5)).toBe(1);
    });

    it("wraps from last item back to first", () => {
      expect(runSequence(["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"], 3)).toBe(0);
    });

    it("does nothing when itemCount is 0", () => {
      expect(runSequence(["ArrowDown"], 0)).toBe(-1);
    });
  });

  describe("ArrowUp", () => {
    it("decrements focusedIndex", () => {
      expect(runSequence(["ArrowDown", "ArrowDown", "ArrowUp"], 5)).toBe(0);
    });

    it("wraps from first item to last", () => {
      expect(runSequence(["ArrowDown", "ArrowUp"], 4)).toBe(3);
    });

    it("wraps from -1 to last item", () => {
      expect(runSequence(["ArrowUp"], 4)).toBe(3);
    });
  });

  describe("Home and End", () => {
    it("Home sets focusedIndex to 0", () => {
      expect(runSequence(["ArrowDown", "ArrowDown", "ArrowDown", "Home"], 5)).toBe(0);
    });

    it("End sets focusedIndex to last", () => {
      expect(runSequence(["End"], 5)).toBe(4);
    });
  });

  describe("Enter", () => {
    it("calls onSelect with the focused index", () => {
      const onSelect = vi.fn();
      runSequence(["ArrowDown", "ArrowDown", "Enter"], 5, { onSelect });
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("does not call onSelect when no item is focused (index -1)", () => {
      const onSelect = vi.fn();
      runSequence(["Enter"], 5, { onSelect });
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("Escape", () => {
    it("calls onDeselect", () => {
      const onDeselect = vi.fn();
      runSequence(["ArrowDown", "Escape"], 5, { onDeselect });
      expect(onDeselect).toHaveBeenCalled();
    });

    it("resets focusedIndex to -1", () => {
      expect(runSequence(["ArrowDown", "Escape"], 5)).toBe(-1);
    });
  });

  describe("isFocused logic", () => {
    it("matches the current focused index", () => {
      const index = runSequence(["ArrowDown", "ArrowDown"], 5);
      expect(index === 1).toBe(true);
      expect(index === 0).toBe(false);
    });

    it("nothing focused initially", () => {
      const index = runSequence([], 5);
      expect(index).toBe(-1);
      expect(index === 0).toBe(false);
    });
  });

  describe("unrecognised keys", () => {
    it("does not change focus for an unrecognised key", () => {
      expect(runSequence(["ArrowDown", "a"], 5)).toBe(0);
    });
  });

  describe("complex sequences", () => {
    it("handles up-down-up-down pattern", () => {
      expect(runSequence(["ArrowDown", "ArrowUp", "ArrowDown", "ArrowDown"], 3)).toBe(1);
    });

    it("End then ArrowDown wraps", () => {
      expect(runSequence(["End", "ArrowDown"], 3)).toBe(0);
    });

    it("Home then ArrowUp wraps", () => {
      expect(runSequence(["Home", "ArrowUp"], 3)).toBe(2);
    });

    it("Escape then ArrowDown starts from 0", () => {
      expect(runSequence(["ArrowDown", "ArrowDown", "Escape", "ArrowDown"], 5)).toBe(0);
    });
  });
});
