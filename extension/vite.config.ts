import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: "manifest.json",
            dest: ".",
          },
          {
            src: "assets/*",
            dest: "assets",
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "../shared"),
      },
    },
    build: {
      outDir: "dist",
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
          "article-extractor": resolve(
            __dirname,
            "src/contents/article-extractor.ts"
          ),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "article-extractor") {
              return "contents/[name].js";
            }
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
