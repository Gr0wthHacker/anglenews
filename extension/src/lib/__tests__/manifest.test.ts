import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { API_BASE_URL } from "@shared/constants";
import { apiHostPermission, buildManifest } from "../manifest";

const source = JSON.parse(
  readFileSync(resolve(__dirname, "../../../manifest.json"), "utf8"),
) as Record<string, unknown>;
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../../package.json"), "utf8"),
) as { version: string };

describe("manifest", () => {
  const built = buildManifest(source);

  it("grants exactly the API origin the client fetches", () => {
    expect(built.host_permissions).toEqual([`${new URL(API_BASE_URL).origin}/*`]);
    expect(apiHostPermission("https://anglecheck-api.vercel.app")).toBe(
      "https://anglecheck-api.vercel.app/*",
    );
  });

  it("declares no content scripts or broad host access", () => {
    expect(built).not.toHaveProperty("content_scripts");
    expect(JSON.stringify(built)).not.toContain("<all_urls>");
    expect(JSON.stringify(built)).not.toMatch(/"\*:\/\/|https?:\/\/\*/);
  });

  it("can inject the extractor on the user's click", () => {
    expect(built.permissions).toEqual(
      expect.arrayContaining(["activeTab", "scripting"]),
    );
  });

  it("refuses a source manifest that sets its own host_permissions", () => {
    expect(() => buildManifest({ ...source, host_permissions: ["https://x.example/*"] })).toThrow();
  });

  it("keeps the manifest and package versions in step", () => {
    expect(source.version).toBe(pkg.version);
  });
});
