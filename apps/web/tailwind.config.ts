import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'] },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          300: '#93b4e8',
          500: '#3b6fd4',
          600: '#2557b8',
          700: '#1e4a9c',
          800: '#183b7d',
          900: '#142f63',
        },
      },
    },
  },
  plugins: [],
};
export default config;
