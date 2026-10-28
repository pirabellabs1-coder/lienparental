/**
 * Pure state transitions for the one-box-per-digit code entry (OTPInput).
 * Kept framework-free so they can be unit-tested (tests/otp-input.test.ts).
 *
 * `digits` always has `length` entries ('' = empty box). The returned `focus`
 * is the index of the box that should receive focus next.
 */
export type OtpStep = { digits: string[]; focus: number }

export const onlyDigits = (raw: string) => raw.replace(/\D/g, '')

export function toDigits(value: string, length: number): string[] {
  return Array.from({ length }, (_, i) => value[i] ?? '')
}

/** Write `chars` starting at `start`, focus the box after the last written one. */
export function fillFrom(digits: string[], start: number, raw: string): OtpStep {
  const length = digits.length
  const chars = onlyDigits(raw).slice(0, Math.max(length - start, 0)).split('')
  const next = [...digits]
  chars.forEach((c, i) => (next[start + i] = c))
  return { digits: next, focus: Math.min(start + chars.length, length - 1) }
}

/**
 * New raw value of box `idx` after an `input` event.
 * - '' → box cleared;
 * - one digit → set it, move to the next box;
 * - the previous digit plus a new one (box was full and the caret was not on a
 *   selection) → keep only the new digit;
 * - several digits (autofill, IME, fast typing into one box) → spread them.
 */
export function applyInput(digits: string[], idx: number, raw: string): OtpStep {
  const length = digits.length
  const clean = onlyDigits(raw)
  if (!clean) {
    const next = [...digits]
    next[idx] = ''
    return { digits: next, focus: idx }
  }
  let single: string | null = null
  if (clean.length === 1) single = clean
  else if (clean.length === 2 && digits[idx] && clean.includes(digits[idx])) {
    single = clean[0] === digits[idx] ? clean[1] : clean[0]
  }
  if (single !== null) {
    const next = [...digits]
    next[idx] = single
    return { digits: next, focus: Math.min(idx + 1, length - 1) }
  }
  return fillFrom(digits, idx, clean)
}

/** Backspace: clear the current box, or the previous one when it is already empty. */
export function applyBackspace(digits: string[], idx: number): OtpStep {
  const next = [...digits]
  if (next[idx]) {
    next[idx] = ''
    return { digits: next, focus: idx }
  }
  if (idx > 0) {
    next[idx - 1] = ''
    return { digits: next, focus: idx - 1 }
  }
  return { digits: next, focus: 0 }
}

/** Keep digits contiguous: a box after the first empty one redirects focus to it. */
export function focusTarget(digits: string[], idx: number): number {
  const firstEmpty = digits.findIndex((x) => !x)
  return firstEmpty !== -1 && idx > firstEmpty ? firstEmpty : idx
}
