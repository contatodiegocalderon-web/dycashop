import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        dygold: {
          200: "#f8ebc4",
          300: "#f3d78a",
          400: "#e4c15a",
          500: "#c9a227",
        },
      },
    },
  },
  plugins: [],
};
export default config;
