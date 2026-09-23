import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        surface: "#141821",
        border: "#242938",
        accent: "#7c5cff",
        accent2: "#00d9c0"
      }
    }
  },
  plugins: []
};

export default config;
