/**
 * Deterministic trigonometry for simulation geometry.
 *
 * `Math.sin`/`Math.cos` are implementation-approximated and may differ by an ulp between JS engines,
 * which shifts a saved coordinate. These functions use only IEEE-754 arithmetic (correctly rounded
 * +, -, *, / and exact `Math.floor`), so the same inputs produce the same bits everywhere. They are
 * for positions the simulation integrates; presentation and one-time world generation keep `Math.*`.
 */

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** Wrap an angle into [-π, π) with exact arithmetic. */
function wrapToPi(angle: number): number {
  return angle - TWO_PI * Math.floor((angle + Math.PI) / TWO_PI);
}

/** sin(x) on [-π/2, π/2] by its Taylor series; the truncation error there is under 4e-6. */
function taylorSin(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040
    + x2 * (1 / 362880 + x2 * (-1 / 39916800))))));
}

/** Engine-independent sine in [-1, 1]. A non-finite angle has no direction and yields 0. */
export function deterministicSin(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = wrapToPi(angle);
  // Cardinal angles are exact; the series alone leaves cos(0) one ulp short of 1.
  if (wrapped === 0) return 0;
  if (wrapped === HALF_PI) return 1;
  if (wrapped === -HALF_PI) return -1;
  if (wrapped > HALF_PI) return taylorSin(Math.PI - wrapped);
  if (wrapped < -HALF_PI) return taylorSin(-Math.PI - wrapped);
  return taylorSin(wrapped);
}

/** Engine-independent cosine in [-1, 1]. */
export function deterministicCos(angle: number): number {
  return deterministicSin(angle + HALF_PI);
}
