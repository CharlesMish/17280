import { defineConfig } from "vite";

export default defineConfig({
  // Keep production assets relative so the same bundle can be hosted at the
  // domain root, below a path such as /watch/, or from a portable local server.
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
