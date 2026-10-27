import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The GitHub Pages build passes --base=/pyskyline/ on the command line.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    // Three.js alone is about 550 kB minified; splitting it buys nothing for a one-page app.
    chunkSizeWarningLimit: 700,
  },
});
