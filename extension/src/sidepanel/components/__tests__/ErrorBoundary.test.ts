import { describe, it, expect, vi } from "vitest";

describe("ErrorBoundary", () => {
  it("module exports a default component", async () => {
    const mod = await import("../ErrorBoundary");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("has getDerivedStateFromError static method", async () => {
    const mod = await import("../ErrorBoundary");
    const ErrorBoundary = mod.default as any;
    expect(ErrorBoundary.getDerivedStateFromError).toBeDefined();

    const state = ErrorBoundary.getDerivedStateFromError(new Error("test"));
    expect(state).toEqual({ hasError: true, error: expect.any(Error) });
  });

  it("getDerivedStateFromError captures the error object", async () => {
    const mod = await import("../ErrorBoundary");
    const ErrorBoundary = mod.default as any;
    const err = new Error("specific error");
    const state = ErrorBoundary.getDerivedStateFromError(err);
    expect(state.error).toBe(err);
    expect(state.error.message).toBe("specific error");
  });
});
