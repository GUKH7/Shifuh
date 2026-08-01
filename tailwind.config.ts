import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    borderRadius: {
      none: "0",
      sm: "var(--radius-small)",
      DEFAULT: "var(--radius-small)",
      md: "var(--radius-small)",
      lg: "var(--radius-control)",
      xl: "var(--radius-control)",
      "2xl": "var(--radius-card)",
      "3xl": "var(--radius-panel)",
      full: "var(--radius-pill)",
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};

export default config;
