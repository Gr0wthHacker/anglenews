// Relative import: vite.config.ts loads this file before the @shared alias exists.
import { API_BASE_URL } from "../../../shared/constants";

/**
 * Builds dist/manifest.json from extension/manifest.json. The only host
 * permission is the API origin, taken from API_BASE_URL so the fetch target
 * and the permission can never drift apart. Used by vite.config.ts.
 */
export function apiHostPermission(apiBaseUrl: string = API_BASE_URL): string {
  return `${new URL(apiBaseUrl).origin}/*`;
}

export function buildManifest(
  source: Record<string, unknown>,
  apiBaseUrl: string = API_BASE_URL,
): Record<string, unknown> {
  if ("host_permissions" in source) {
    throw new Error(
      "extension/manifest.json must not set host_permissions; it is derived from API_BASE_URL in shared/constants.ts",
    );
  }
  return { ...source, host_permissions: [apiHostPermission(apiBaseUrl)] };
}
