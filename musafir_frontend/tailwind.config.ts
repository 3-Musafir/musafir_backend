import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#FF9000",
          "primary-hover": "#E68200",
          "primary-light": "#FFA726",
          "primary-disabled": "#FFD4A3",
          error: "#DE1135",
          warning: "#F6BC2F",
        },
        semantic: {
          heading: "#2B2D42",
          text: "#757575",
          "text-light": "#9CA3AF",
          "btn-secondary-text": "#F6F6F6",
        },
        canvas: {
          base: "#FFF9F2",
          soft: "#FFF2E1",
          line: "#F3E6D6",
        },
      },
      fontFamily: {
        outfit: ["Outfit", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 16px 40px rgba(43, 45, 66, 0.08)",
        soft: "0 8px 20px rgba(43, 45, 66, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
