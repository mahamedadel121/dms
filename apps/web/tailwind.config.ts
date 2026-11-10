import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { fontFamily: { sans: ['Cairo', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'] } } },
  plugins: [],
};
export default config;
