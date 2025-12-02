/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        // Warm Art Gallery Palette
        cream: "#FAF8F5",
        terracotta: "#B5896C",
        "terracotta-dark": "#9F7659",
        "warm-charcoal": "#3E3933",
        "warm-gray": "#6B6560",
        "warm-gray-light": "#9C9188",
        "warm-beige": "#E8E3DC",
        "warm-beige-dark": "#D5CFC5",
        "warm-tan": "#8B6F56",
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
