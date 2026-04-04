import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    root: resolve(__dirname, "src"),
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: resolve(__dirname, "manifest.json"),
            dest: ".",
          },
          {
            src: resolve(__dirname, "assets") + "/*",
            dest: "assets",
          },
        ],
      }),
      contentScriptPlugin(isDev),
    ],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "../shared"),
      },
    },
    // Use relative paths for assets — Chrome extensions load via chrome-extension:// protocol
    base: "",
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      sourcemap: isDev,
      minify: !isDev,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
          popup: resolve(__dirname, "src/popup/index.html"),
          options: resolve(__dirname, "src/options/index.html"),
          "service-worker": resolve(
            __dirname,
            "src/background/service-worker.ts"
          ),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "service-worker") {
              return "background/[name].js";
            }
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },
    },
  };
});

/**
 * Custom Vite plugin that builds content scripts as separate IIFE bundles
 * after the main build completes. This ensures they are self-contained
 * with no ES module imports/exports (required for Chrome content scripts).
 */
function contentScriptPlugin(isDev: boolean) {
  return {
    name: "build-content-scripts",
    async closeBundle() {
      const { build } = await import("vite");
      await build({
        configFile: false,
        resolve: {
          alias: {
            "@shared": resolve(__dirname, "../shared"),
          },
        },
        build: {
          outDir: resolve(__dirname, "dist/contents"),
          emptyOutDir: false,
          sourcemap: isDev,
          minify: !isDev,
          lib: {
            entry: resolve(__dirname, "src/contents/article-extractor.ts"),
            name: "articleExtractor",
            formats: ["iife"],
            fileName: () => "article-extractor.js",
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      });
    },
  };
}
