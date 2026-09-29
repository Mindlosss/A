import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(() => ({
  // Rutas relativas para que el build cargue desde dist/ dentro de pywebview.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  clearScreen: false,
  // app.py --dev abre este puerto fijo.
  server: { port: 1420, strictPort: true },
}));
