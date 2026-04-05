import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// We test useKeyboardNav by mocking React's hooks so we can exercise
// handleKeyDown, isFocused, and state transitions without a DOM.
// ---------------------------------------------------------------------------

let stateValue: number;
let stateSetter: (v: number | ((prev: number) => number)) => void;

vi.mock("react", () => ({
  useState: (init: number) => {
    stateValue = init;
    stateSetter = (v: number | ((prev: number) => number)) => {
      if (typeof v === "function") {
        stateValue = v(stateValue);
      } else {
        stateValue = v;
      }
    };
    return [stateValue, stateSetter] as const;
  },
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useEffect: (_fn: Function, _deps?: unknown[]) => {
    // no-op in unit test context
  },
  useRef: (init: unknown) => ({ current: init }),
}));

// Suppress scrollItemIntoView's requestAnimationFrame + DOM calls
vi.stubGlobal("requestAnimationFrame", (_cb: Function) => {});

import { useKeyboardNav } from "../useKeyboardNav.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyEvent(key: string): React.KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

function setup(
  itemCount: number,
  options?: { onSelect?: (i: number) => void; onDeselect?: () => void },
) {
  // Reset internal state before each setup
  stateValue = -1;
  const result = useKeyboardNav(itemCount, options);
  // Re-bind result getters so they reflect the mutable stateValue
  return {
    get focusedIndex() {
      return stateValue;
    },
    handleKeyDown: result.handleKeyDown,
    isFocused: result.isFocused,
    setFocusedIndex: result.setFocusedIndex,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useKeyboardNav", () => {
  beforeEach(() => {
    stateValue = -1;
  });

  // ── ArrowDown ──────────────────────────────────────────────────────────

  describe("ArrowDown", () => {
    it("increments focusedIndex from -1 to 0", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown"));
      expect(nav.focusedIndex).toBe(0);
    });

    it("increments focusedIndex from 0 to 1", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -1 -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // 0 -> 1
      expect(nav.focusedIndex).toBe(1);
    });

    it("wraps from last item back to first", () => {
      const nav = setup(3);
      // Move to index 2 (last)
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 1
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 2
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0 (wrap)
      expect(nav.focusedIndex).toBe(0);
    });

    it("does nothing when itemCount is 0", () => {
      const nav = setup(0);
      nav.handleKeyDown(makeKeyEvent("ArrowDown"));
      expect(nav.focusedIndex).toBe(-1);
    });

    it("calls preventDefault", () => {
      const nav = setup(3);
      const e = makeKeyEvent("ArrowDown");
      nav.handleKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });
  });

  // ── ArrowUp ────────────────────────────────────────────────────────────

  describe("ArrowUp", () => {
    it("decrements focusedIndex", () => {
      const nav = setup(5);
      // First go down twice
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 1
      nav.handleKeyDown(makeKeyEvent("ArrowUp")); // -> 0
      expect(nav.focusedIndex).toBe(0);
    });

    it("wraps from first item to last", () => {
      const nav = setup(4);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowUp")); // -> 3 (wrap)
      expect(nav.focusedIndex).toBe(3);
    });

    it("wraps from -1 to last item", () => {
      const nav = setup(4);
      nav.handleKeyDown(makeKeyEvent("ArrowUp")); // -1 > 0 is false so -> itemCount-1 = 3
      expect(nav.focusedIndex).toBe(3);
    });
  });

  // ── Home / End ─────────────────────────────────────────────────────────

  describe("Home and End", () => {
    it("Home sets focusedIndex to 0", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 1
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 2
      nav.handleKeyDown(makeKeyEvent("Home"));
      expect(nav.focusedIndex).toBe(0);
    });

    it("End sets focusedIndex to last", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("End"));
      expect(nav.focusedIndex).toBe(4);
    });
  });

  // ── Enter ──────────────────────────────────────────────────────────────

  describe("Enter", () => {
    it("calls onSelect with the focused index", () => {
      const onSelect = vi.fn();
      const nav = setup(5, { onSelect });
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 1
      nav.handleKeyDown(makeKeyEvent("Enter"));
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("does not call onSelect when no item is focused (index -1)", () => {
      const onSelect = vi.fn();
      const nav = setup(5, { onSelect });
      nav.handleKeyDown(makeKeyEvent("Enter"));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // ── Escape ─────────────────────────────────────────────────────────────

  describe("Escape", () => {
    it("calls onDeselect", () => {
      const onDeselect = vi.fn();
      const nav = setup(5, { onDeselect });
      nav.handleKeyDown(makeKeyEvent("ArrowDown"));
      nav.handleKeyDown(makeKeyEvent("Escape"));
      expect(onDeselect).toHaveBeenCalled();
    });

    it("resets focusedIndex to -1", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("Escape"));
      expect(nav.focusedIndex).toBe(-1);
    });
  });

  // ── isFocused ──────────────────────────────────────────────────────────

  describe("isFocused", () => {
    it("returns true for the currently focused index", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 1
      expect(nav.isFocused(1)).toBe(true);
    });

    it("returns false for a non-focused index", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      expect(nav.isFocused(2)).toBe(false);
    });

    it("returns false for all indices when nothing is focused", () => {
      const nav = setup(5);
      expect(nav.isFocused(0)).toBe(false);
      expect(nav.isFocused(1)).toBe(false);
      expect(nav.isFocused(-1)).toBe(true); // -1 === -1
    });
  });

  // ── Unrecognised keys ──────────────────────────────────────────────────

  describe("unrecognised keys", () => {
    it("does not change focus for an unrecognised key", () => {
      const nav = setup(5);
      nav.handleKeyDown(makeKeyEvent("ArrowDown")); // -> 0
      nav.handleKeyDown(makeKeyEvent("a"));
      expect(nav.focusedIndex).toBe(0);
    });
  });
});
