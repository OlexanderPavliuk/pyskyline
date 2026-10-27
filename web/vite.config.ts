import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The GitHub Pages build passes --base=/pyskyline/ on the command line.
export default defineConfig({
  plugins: [tailwindcss()],
});
