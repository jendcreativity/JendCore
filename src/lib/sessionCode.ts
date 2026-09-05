/**
 * Generates a short, human-shareable session code.
 *
 * Format: `JC-XXXX-XXXX` (10 chars after the prefix, easy to read aloud).
 * Uses an unambiguous alphabet (no 0/O, 1/I) to reduce mis-typing.
 *
 * We do NOT rely on `crypto.randomUUID()` here because the resulting
 * UUIDs are too long to share verbally and look intimidating to non-technical
 * users. A 10-char code from the alphabet below gives ~40 bits of entropy,
 * which is more than sufficient for ephemeral session identifiers.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/O/1/I

function randomChar(): string {
  // Prefer crypto.getRandomValues when available, fall back to Math.random.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return ALPHABET[buf[0] % ALPHABET.length];
  }
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

export function generateSessionCode(): string {
  const part = (): string => Array.from({ length: 4 }, randomChar).join('');
  return `JC-${part()}-${part()}`;
}

/**
 * Validates that a string looks like a session code we produced.
 * Used to reject malformed input before sending it to the backend.
 */
export function isValidSessionCode(value: string): boolean {
  return /^JC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.trim().toUpperCase());
}

/** Normalises user input (uppercase, trimmed). */
export function normaliseSessionCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
