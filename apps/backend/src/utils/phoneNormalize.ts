/**
 * Moroccan phone normalization.
 *
 * Accepts:   0661234567 | +212661234567 | 00212661234567 | 212661234567
 * Normalized (stored): +212661234567
 * Display:   0661234567
 */

export function normalizePhone(raw: string): { normalized: string; display: string } {
  // Strip everything except digits and leading +
  let digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('+')) {
    digits = digits.slice(1); // remove leading +
  }

  // Strip country code variants
  if (digits.startsWith('00212')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('212')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 9) {
    throw new Error(`Invalid Moroccan phone number: "${raw}" (expected 9 digits after normalization, got ${digits.length})`);
  }

  const normalized = `+212${digits}`;
  const display = `0${digits}`;

  return { normalized, display };
}

export function isValidMoroccanPhone(raw: string): boolean {
  try {
    normalizePhone(raw);
    return true;
  } catch {
    return false;
  }
}
