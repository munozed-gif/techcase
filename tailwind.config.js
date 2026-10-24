/** @type {import('tailwindcss').Config} */
export default {
  // Tie dark: variants to the .arena-dark class, not the OS prefers-color-scheme.
  // Without this, dark:text-white fires when the OS is dark even if the app is in light mode,
  // causing white text on white card backgrounds.
  darkMode: ['class', '.arena-dark'],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
    "./techcase-v8.jsx",
    "./techcase-v9.jsx",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
