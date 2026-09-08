/**
 * Small deterministic hashing/PRNG helpers shared by anything that needs a
 * "same input always looks the same" random value - e.g. a customer's
 * procedural logo, a per-invoice stamp rotation jitter, or a cheque's bank
 * name, all of which must be stable across reloads/re-renders without
 * needing to store extra random state anywhere.
 */

/** djb2 string hash -> unsigned 32-bit integer. */
export function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG - fast, decent-quality, deterministic from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: a deterministic PRNG seeded from an arbitrary string. */
export function rngFromString(input: string): () => number {
  return mulberry32(hashString(input));
}
