import { defineConfig } from "vite";

// Deployed as a GitHub Pages *project* site (not a user/org root site),
// so every built asset URL needs the repo name as a path prefix —
// otherwise absolute paths like "/images/..." would 404 once served
// from https://<username>.github.io/seasonedz-ecommerce/.
export default defineConfig({
  base: "/seasonedz-ecommerce/",
});
