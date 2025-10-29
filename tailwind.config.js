const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  // Belt-and-suspenders to ensure bg-white exists even if someone edits the theme later
  safelist: ['bg-white'],

  theme: {
    extend: {
      colors: {
        // Re-affirm defaults so utilities like bg-white/bg-black are generated
        white: colors.white,
        black: colors.black,
      },
    },
  },
  plugins: [],
}
