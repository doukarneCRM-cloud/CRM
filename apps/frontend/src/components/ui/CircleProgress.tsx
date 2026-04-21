import { cn } from '@/lib/cn';

interface CircleProgressProps {
  value: number; // 0–100
  color?: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

const CircleProgress = ({
  value,
  color = '#56351E',
  size = 80,
  strokeWidth = 8,
  label,
  sublabel,
  className,
}: CircleProgressProps) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedValue / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#F0EAE3"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>

      {/* Center label */}
      {(label || sublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {label && (
            <span className="text-sm font-bold text-gray-900 leading-tight">{label}</span>
          )}
          {sublabel && (
            <span className="text-[10px] text-gray-400 leading-tight">{sublabel}</span>
          )}
        </div>
      )}
    </div>
  );
};

export { CircleProgress };
