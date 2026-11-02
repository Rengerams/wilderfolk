/**
 * Eenvoudige rem op herhaald proberen (brute force op wachtwoorden en codes).
 * De telling staat in het geheugen van de API: genoeg voor één server, en bij
 * een herstart beginnen we weer schoon.
 */
import { timingSafeEqual } from "node:crypto"

const pogingen = new Map<string, number[]>()
const MAX_SLEUTELS = 5000

/** Aantal seconden wachten als de sleutel te vaak is geprobeerd, anders 0. */
export function teVaakGeprobeerd(sleutel: string, maximum: number, vensterMinuten: number): number {
  const nu = Date.now()
  const grens = nu - vensterMinuten * 60_000
  const recent = (pogingen.get(sleutel) ?? []).filter((moment) => moment > grens)
  pogingen.set(sleutel, recent)
  if (recent.length < maximum) return 0
  const vrijNa = recent[recent.length - maximum] + vensterMinuten * 60_000
  return Math.max(1, Math.ceil((vrijNa - nu) / 1000))
}

export function registreerPoging(sleutel: string) {
  if (pogingen.size > MAX_SLEUTELS) pogingen.clear()
  const recent = pogingen.get(sleutel) ?? []
  recent.push(Date.now())
  pogingen.set(sleutel, recent)
}

/** Na een geslaagde poging mag de teller weer op nul. */
export function wisPogingen(sleutel: string) {
  pogingen.delete(sleutel)
}

/** Timing-veilige vergelijking van twee korte teksten (codes). */
export function veiligeVergelijking(a: string, b: string): boolean {
  const eerste = Buffer.from(a)
  const tweede = Buffer.from(b)
  if (eerste.length !== tweede.length) return false
  return timingSafeEqual(eerste, tweede)
}
