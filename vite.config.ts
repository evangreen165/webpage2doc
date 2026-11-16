import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "sidepanel",
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "sidepanel/src"),
    },
  },
  build: {
    outDir: "../dist/sidepanel",
    emptyOutDir: false,
  },
});
