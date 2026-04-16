import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a12",
        primary: "#667eea",
        card: "#1a1a2e",
      },
    },
  },
  plugins: [],
};

export default config;
