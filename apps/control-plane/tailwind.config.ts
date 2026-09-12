import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#07070a",
        ash: "#121218",
      },
      keyframes: {
        "aurora-bg": {
          "0%": { backgroundPosition: "50% 50%, 50% 50%" },
          "100%": { backgroundPosition: "350% 50%, 350% 50%" },
        },
        "glow-spin": {
          to: { "--glow-angle": "360deg" },
        },
        pulsebar: {
          "0%, 100%": { transform: "scaleY(0.35)", opacity: "0.5" },
          "50%": { transform: "scaleY(1)", opacity: "1" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "aurora-bg": "aurora-bg 60s linear infinite",
        "glow-spin": "glow-spin 4s linear infinite",
        pulsebar: "pulsebar 1.1s ease-in-out infinite",
        ticker: "ticker 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
