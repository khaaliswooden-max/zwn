import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        zwn: {
          bg: '#0a0a0a',
          surface: '#111111',
          border: '#1e1e1e',
          text: '#f0ece4',
          muted: '#888880',
          teal: '#1D9E75',
          purple: '#7F77DD',
          amber: '#EF9F27',
          coral: '#D85A30',
          gray: '#888780',
        },
      },
    },
  },
  plugins: [],
};

export default config;
