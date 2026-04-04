/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        "angle-blue": "#2563eb",
        "angle-red": "#dc2626",
        "angle-green": "#16a34a",
        "angle-amber": "#d97706",
        "angle-purple": "#9333ea",
        "angle-gray": "#4b5563",
        bias: {
          "far-left": "#2563eb",
          left: "#3b82f6",
          "center-left": "#60a5fa",
          center: "#16a34a",
          "center-right": "#f59e0b",
          right: "#ef4444",
          "far-right": "#dc2626",
        },
      },
      maxWidth: {
        panel: "400px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
