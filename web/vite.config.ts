import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/jinji-farm-manager/",
  plugins: [react()],
  build: { sourcemap: false },
});
