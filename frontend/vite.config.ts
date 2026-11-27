import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /rpc y /api se reenvían al servidor de producción local (npm start, puerto 3000),
// que a su vez habla con el nodo blockchain. Así el frontend usa las mismas rutas que en Coolify.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/rpc": "http://127.0.0.1:3000",
      "/api": "http://127.0.0.1:3000",
    },
  },
});
