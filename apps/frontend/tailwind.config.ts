import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#18181B',
          light: '#27272A',
          dark: '#09090B',
        },
        accent: '#F4F4F5',
        // Warm earthy accent — used by the Orders KPI cards. Lifts the
        // dashboard out of the cool-blue/indigo palette without fighting the
        // monochrome primary. 500 is the readable mid-tone, 50 the chip bg.
        caramel: {
          50:  '#FDF7EC',
          100: '#FAEAC9',
          200: '#F3D292',
          300: '#E5B158',
          400: '#D29630',
          500: '#B8801F',
          600: '#9A6917',
          700: '#7A5311',
          DEFAULT: '#B8801F',
        },
        // Coordinated pastel tones for KPI / category / chart cards. Each
        // tone has a card-bg (50), icon-bg (100), accent (500), and a
        // chart-stop (300). Cards read as one coherent set instead of
        // one-off colors. Lavender = brand signal; peach = warm/orders;
        // mint = success; sky = info/customer; rose = alert/return;
        // amber = pending/attention.
        tone: {
          lavender: { 50: '#F4F0FF', 100: '#EAE2FF', 300: '#B19BFF', 500: '#7C5CFF' },
          peach:    { 50: '#FFF1EA', 100: '#FFE0D0', 300: '#FFA67E', 500: '#F37944' },
          mint:     { 50: '#EAF8F0', 100: '#D2F0E0', 300: '#7DD8A4', 500: '#2EBE6D' },
          sky:      { 50: '#E8F4FF', 100: '#CFE6FF', 300: '#7EB7FF', 500: '#3D8BFF' },
          rose:     { 50: '#FFEDF1', 100: '#FFD3DD', 300: '#FF8DA5', 500: '#F25278' },
          amber:    { 50: '#FFF6E0', 100: '#FFE7AC', 300: '#FFC95A', 500: '#E8A317' },
        },
        surface: 'rgba(255,255,255,0.85)',
        bg: '#F8F9FA',
        status: {
          // Confirmation statuses
          'new': '#6366F1',
          'confirmed': '#22C55E',
          'callback': '#F59E0B',
          'unreachable': '#EF4444',
          'cancelled': '#6B7280',
          'duplicate': '#8B5CF6',
          'wrong-number': '#EC4899',
          'no-stock': '#F97316',
          'postponed': '#14B8A6',
          // Shipping statuses
          'ready-to-ship': '#3B82F6',
          'in-transit': '#A855F7',
          'delivered': '#16A34A',
          'returned': '#DC2626',
          'return-validated': '#059669',
          'return-refused': '#B91C1C',
          'exchange': '#D97706',
          'lost': '#374151',
          'destroyed': '#1F2937',
        },
      },
      borderRadius: {
        card: '20px',
        btn: '12px',
        input: '10px',
        badge: '999px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(16,24,40,0.08)',
        hover: '0 8px 32px rgba(16,24,40,0.14)',
        glass: '0 4px 24px rgba(16,24,40,0.08)',
      },
      backdropBlur: {
        glass: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
