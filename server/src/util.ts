import type { NextFunction, Request, RequestHandler, Response } from "express"
import { q } from "./db"

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

/** Vangt fouten in async route-handlers netjes af. */
export function ah(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

export function stuurFout(res: Response, status: number, bericht: string) {
  res.status(status).json({ fout: bericht })
}

export function vandaag(): string {
  return new Date().toISOString().slice(0, 10)
}

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
]

export function datumLang(datum: string | null | undefined): string {
  if (!datum) return ""
  const d = new Date(`${datum.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return datum
  return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`
}

export function datumKort(datum: string | null | undefined): string {
  if (!datum) return ""
  const d = new Date(`${datum.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return datum
  const dagen = ["zo", "ma", "di", "wo", "do", "vr", "za"]
  return `${dagen[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function naam(deelnemer: {
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
}): string {
  return [deelnemer.voornaam, deelnemer.tussenvoegsel, deelnemer.achternaam]
    .filter(Boolean)
    .join(" ")
}

/** Leest een instelling met een standaardwaarde. */
export async function instelling(sleutel: string, standaard: string): Promise<string> {
  const rij = await q<{ waarde: string }>("select waarde from instellingen where sleutel = $1", [sleutel])
  return rij[0]?.waarde ?? standaard
}

export async function moduleAan(sleutel: string): Promise<boolean> {
  const rij = await q<{ aan: boolean }>("select aan from modules where sleutel = $1", [sleutel])
  return rij[0]?.aan === true
}

export function alsGetal(waarde: unknown, standaard: number): number {
  const getal = typeof waarde === "number" ? waarde : Number.parseFloat(String(waarde ?? ""))
  return Number.isFinite(getal) ? getal : standaard
}

export function veiligeTekst(waarde: unknown): string {
  return typeof waarde === "string" ? waarde.trim() : ""
}

/** Leest een positief geheel getal uit een queryparameter; null als die ontbreekt. */
export function getalParam(waarde: unknown): number | null {
  const getal = Number(veiligeTekst(waarde))
  return Number.isInteger(getal) && getal > 0 ? getal : null
}
