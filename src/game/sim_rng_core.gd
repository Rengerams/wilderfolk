@tool
class_name SimRngCore
extends RefCounted

## Bit-exact GDScript port of the 32-bit integer core of `src/game/simRng.ts`.
##
## Why this file is careful: JavaScript bitwise operators are 32-bit, but
## GDScript `int` is a signed 64-bit integer. Every value here is therefore held
## as an UNSIGNED 32-bit integer (0 .. 0xFFFFFFFF) and re-masked after any
## operation that can exceed 32 bits, so the bit patterns always match V8's
## ToInt32/ToUint32 coercion.
##
## `imul` is computed from 16-bit halves on purpose. A naive `a * b` on two
## values near 2**32 reaches ~1.8e19, past the signed 64-bit ceiling (~9.2e18),
## so it would depend on int64 wraparound behaviour. The half-split never
## exceeds ~8.6e9 and is exact.
##
## Parity is asserted by `res://tests/test_sim_rng.gd` against golden values
## generated from the TypeScript implementation by `tmp/dump-sim-rng.mts`.

const MASK32: int = 0xFFFFFFFF
const TWO_POW_32: float = 4294967296.0
const MULBERRY32_INCREMENT: int = 0x6d2b79f5
const FNV_OFFSET_BASIS: int = 2166136261
const FNV_PRIME: int = 16777619


## Low 32 bits of the product, matching JavaScript's `Math.imul`.
##
## The full product expands to
##   a_lo*b_lo + (a_lo*b_hi + a_hi*b_lo)*2**16 + (a_hi*b_hi)*2**32
## so modulo 2**32 only the low 16 bits of the cross term survive.
static func imul(a: int, b: int) -> int:
	var a_lo: int = a & 0xFFFF
	var a_hi: int = (a >> 16) & 0xFFFF
	var b_lo: int = b & 0xFFFF
	var b_hi: int = (b >> 16) & 0xFFFF
	var cross: int = (a_lo * b_hi + a_hi * b_lo) & 0xFFFF
	return (a_lo * b_lo + (cross << 16)) & MASK32


## 32-bit FNV-1a string hash, used to derive independent owner-stream salts.
##
## TypeScript hashes UTF-16 code units (`charCodeAt`); `unicode_at` returns the
## code point. These are identical for the BMP, so every ASCII owner name in the
## simulation matches exactly. An astral-plane owner name (> U+FFFF) would not.
static func hash_salt(text: String) -> int:
	var h: int = FNV_OFFSET_BASIS
	for i: int in text.length():
		h = h ^ text.unicode_at(i)
		h = imul(h, FNV_PRIME)
	return h & MASK32


## Advances a Mulberry32 state by one step: `s = (s + 0x6d2b79f5) >>> 0`.
static func mulberry32_advance(state: int) -> int:
	return (state + MULBERRY32_INCREMENT) & MASK32


## Mulberry32 output mix for an already-advanced state, as a uint32.
##
## Kept separate from the float form so parity can be asserted on integers:
## comparing `u32` values removes all floating-point formatting risk, and
## `u32 / 2**32` is exact in binary floating point anyway.
static func mulberry32_draw_u32(advanced_state: int) -> int:
	var t: int = advanced_state
	t = imul(t ^ (t >> 15), t | 1)
	var added: int = (t + imul(t ^ (t >> 7), t | 61)) & MASK32
	t = t ^ added
	return (t ^ (t >> 14)) & MASK32


## Mulberry32 output for an already-advanced state, as a float in `[0, 1)`.
static func mulberry32_draw(advanced_state: int) -> float:
	return float(mulberry32_draw_u32(advanced_state)) / TWO_POW_32


## The state a fresh stream starts from, *before* its first advance.
##
## Mirrors `createSeededRng`: the salt-mixed seed is advanced once, then the
## pre-mix step folds one draw back into the state to remove low-entropy seed
## correlation on the very first output.
static func derive_initial_state(seed: int, owner: String) -> int:
	var s: int = mulberry32_advance((seed & MASK32) ^ hash_salt(owner))
	var pre_mixed: int = mulberry32_advance(s)
	var t: int = pre_mixed
	t = imul(t ^ (t >> 15), t | 1)
	t = t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK32)
	return (pre_mixed ^ t) & MASK32
