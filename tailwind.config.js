/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors from design system
        primary: {
          DEFAULT: '#4169E1', // Royal Blue
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#4169E1',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          DEFAULT: '#FF8C00', // Orange
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#FF8C00',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // New Dark Theme Colors
        'app-primary': '#0A0E27',
        'app-secondary': '#141B3D',
        'app-card': '#1C2447',
        'app-blue': '#0066FF',
        'app-cyan': '#00D4FF',
        'chart-pink': '#FF3B81',
        'chart-purple': '#A855F7',
        'chart-blue': '#3B82F6',
        'chart-cyan': '#06B6D4',
        'text-primary': '#FFFFFF',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #0066FF, #00D4FF)',
      },
      boxShadow: {
        'card': '0 4px 16px rgba(0, 0, 0, 0.2)',
        'button': '0 4px 12px rgba(0, 102, 255, 0.3)',
        'button-hover': '0 6px 16px rgba(0, 102, 255, 0.4)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 
               'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['Fira Code', 'Courier New', 'Courier', 'monospace'],
      },
      maxWidth: {
        'content': '1200px',
        'ultrawide': '60vw',
      },
      screens: {
        'xs': '375px',
        '3xl': '2560px',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-in',
      },
    },
  },
  plugins: [],
}


