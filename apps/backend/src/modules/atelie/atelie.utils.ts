/**
 * Shared helpers for the Atelie module.
 *
 * Week math is centralized here so attendance, salary, and the cron all agree
 * on what "Monday 00:00 UTC" means — no timezone drift between the three.
 */

/** Returns the Monday 00:00 UTC of the ISO week containing `date`. */
export function mondayOfWeekUTC(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay();                 // 0 = Sun, 1 = Mon, …, 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;     // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** popcount for 7-bit attendance mask (Mon..Sun). */
export function popcount(mask: number): number {
  let count = 0;
  let n = mask & 0b1111111;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

/** Day labels aligned with bit positions (bit 0 = Monday). */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type DayState = 'absent' | 'half' | 'full';

/**
 * Apply a tri-state toggle to a pair of masks. `daysMask` bits = full days,
 * `halfDaysMask` bits = half days. The two are mutually exclusive: setting a
 * bit in one clears it in the other.
 */
export function applyDayState(
  daysMask: number,
  halfDaysMask: number,
  index: number,
  state: DayState,
): { daysMask: number; halfDaysMask: number } {
  const bit = 1 << index;
  const safeF = daysMask & 0b1111111;
  const safeH = halfDaysMask & 0b1111111;
  switch (state) {
    case 'full':
      return { daysMask: safeF | bit, halfDaysMask: safeH & ~bit };
    case 'half':
      return { daysMask: safeF & ~bit, halfDaysMask: safeH | bit };
    case 'absent':
      return { daysMask: safeF & ~bit, halfDaysMask: safeH & ~bit };
  }
}

/** daysWorked = full_count + half_count * 0.5. */
export function computeDaysWorked(daysMask: number, halfDaysMask: number): number {
  return popcount(daysMask) + popcount(halfDaysMask) * 0.5;
}

/** Compute this week's salary amount given daysWorked (possibly fractional). */
export function computeWeekSalary(
  daysWorked: number,
  baseSalary: number,
  workingDays: number,
): number {
  if (workingDays <= 0) return 0;
  const dailyRate = baseSalary / workingDays;
  return Math.round(daysWorked * dailyRate * 100) / 100;
}
