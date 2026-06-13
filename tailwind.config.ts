import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1a1a2e",
        brand: "#0F6E56",
        "brand-light": "#12896b",
      },
    },
  },
  plugins: [],
};

export default config;
