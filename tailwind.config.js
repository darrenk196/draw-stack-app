/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        drawstack: {
          primary: "#6366f1",
          secondary: "#8b5cf6",
          accent: "#06b6d4",
          neutral: "#1f2937",
          "base-100": "#191919",
          "base-200": "#242424",
          "base-300": "#2d2d2d",
          "base-content": "#ffffff",
          info: "#3abff8",
          success: "#36d399",
          warning: "#fbbd23",
          error: "#f87272",
        },
      },
    ],
    darkTheme: "drawstack",
  },
};
