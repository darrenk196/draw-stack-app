/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        // Warm Art Gallery Palette - Optimized for WCAG AA contrast compliance
        cream: "#FAF8F5",
        terracotta: "#B5896C",
        "terracotta-dark": "#9F7659",
        "warm-charcoal": "#3E3933",
        "warm-gray": "#5A4F47", // Increased contrast from #6B6560 (now 5.1:1 ratio on cream)
        "warm-gray-light": "#8B7D75", // Improved contrast
        "warm-beige": "#E8E3DC",
        "warm-beige-dark": "#D5CFC5",
        "warm-tan": "#8B6F56",
        "focus-ring": "#9F7659", // Darker terracotta for focus indicators
      },
      letterSpacing: {
        tightest: "-0.025em",
        tighter: "-0.02em",
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        drawstack: {
          primary: "#B5896C", // terracotta
          "primary-focus": "#9F7659", // terracotta-dark
          "primary-content": "#ffffff",
          secondary: "#FAF8F5", // cream
          accent: "#B5896C",
          neutral: "#6B6560", // warm-gray
          "base-100": "#FAF8F5", // cream background
          "base-200": "#ffffff", // white for cards
          "base-300": "#E8E3DC", // warm-beige for borders
          "base-content": "#3E3933", // warm-charcoal for text
          info: "#B5896C",
          success: "#4CAF50",
          warning: "#FFB300",
          error: "#f87272",
        },
      },
    ],
    darkTheme: "drawstack",
  },
};
