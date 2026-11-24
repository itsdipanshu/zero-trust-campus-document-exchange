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
        // Forest & Ivory Premium Palette
        ivory: {
          50: "#FAF9F6",
          100: "#F4F3EE",
          200: "#E9EBE5",
          300: "#D9DED8",
          DEFAULT: "#F4F3EE",
        },
        forest: {
          50: "#EAF1EE",
          100: "#D3E2DC",
          200: "#A9C5BB",
          300: "#7FA89A",
          400: "#75978A", // secondary accent
          500: "#5A8B7D",
          600: "#477B70", // primary accent
          700: "#325C53",
          800: "#224741",
          900: "#183A35", // sidebar
          950: "#0F2623",
          DEFAULT: "#183A35",
        },
        highlight: {
          DEFAULT: "#C18B52", // warm bronze
          50: "#FBF7F2",
          100: "#F6ECE0",
          200: "#ECD5BA",
          300: "#E2BD93",
          400: "#D8A66E",
          500: "#C18B52",
          600: "#A67138",
          700: "#845627",
        },
        ink: {
          50: "#F6F7F6",
          100: "#EAECE9",
          200: "#D9DED8", // borders
          300: "#A8B2AA",
          400: "#7D8880",
          500: "#68736B", // secondary text
          600: "#4F5952",
          700: "#3A433D",
          800: "#2B322D",
          900: "#202923", // main text
          DEFAULT: "#202923",
        },
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        soft: "0 2px 10px rgba(24, 58, 53, 0.05)",
        card: "0 4px 16px rgba(24, 58, 53, 0.06)",
        float: "0 8px 24px rgba(24, 58, 53, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
