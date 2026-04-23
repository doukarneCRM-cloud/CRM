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
