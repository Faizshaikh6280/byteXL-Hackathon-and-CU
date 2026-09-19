/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  safelist: [
    { pattern: /bg-(slate|red|amber|emerald|cyan|purple)-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /text-(slate|red|amber|emerald|cyan|purple)-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /border-(slate|red|amber|emerald|cyan|purple)-(500|600|700|800)/ },
    { pattern: /shadow-\[.*?\]/ },
    'backdrop-blur-xl', 'backdrop-blur-md', 'backdrop-blur-sm',
    'rounded-xl', 'rounded-2xl', 'p-4', 'mb-4', 'mb-6', 'grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-4',
    'flex', 'flex-col', 'items-center', 'justify-between', 'font-bold', 'text-xl', 'text-lg', 'text-sm'
  ],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        panel: "var(--panel)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: "var(--popover)",
        card: "var(--card)",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
