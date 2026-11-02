import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { een, q } from "./db"
import { RECHTEN_ACTIES, RECHTEN_ONDERDELEN, type RechtActie } from "./schema"

export type Gebruiker = {
  id: number
  naam: string
  email: string
  rol_id: number
  rol_naam: string
  rechten: Record<string, Record<string, boolean>>
  actief: boolean
  twee_staps: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      gebruiker?: Gebruiker
    }
  }
}

export const SESSIE_COOKIE = "diligence_sessie"
const SESSIE_UREN = 12
const INACTIVITEIT_MINUTEN = 240

/** Kostbaar genoeg om raden traag te maken, nog steeds snel bij het inloggen. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export const WACHTWOORD_MIN_LENGTE = 10
export const WACHTWOORD_MAX_LENGTE = 200

/** Geeft een melding terug als het wachtwoord niet voldoet, anders null. */
export function wachtwoordFout(wachtwoord: string): string | null {
  if (wachtwoord.length < WACHTWOORD_MIN_LENGTE) {
    return `Kies een wachtwoord van minstens ${WACHTWOORD_MIN_LENGTE} tekens. Een lange zin werkt het beste.`
  }
  if (wachtwoord.length > WACHTWOORD_MAX_LENGTE) {
    return `Gebruik een wachtwoord van hoogstens ${WACHTWOORD_MAX_LENGTE} tekens.`
  }
  return null
}

export function hashWachtwoord(wachtwoord: string): string {
  const zout = randomBytes(16).toString("hex")
  const hash = scryptSync(wachtwoord, zout, 64, SCRYPT).toString("hex")
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${zout}$${hash}`
}

export function controleerWachtwoord(wachtwoord: string, opgeslagen: string): boolean {
  const delen = opgeslagen.split("$")
  if (delen[0] === "scrypt" && delen.length === 6) {
    const [, n, r, p, zout, hash] = delen
    const berekend = scryptSync(wachtwoord, zout, 64, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    })
    const verwacht = Buffer.from(hash, "hex")
    if (berekend.length !== verwacht.length) return false
    return timingSafeEqual(berekend, verwacht)
  }
  // Oud formaat "zout:hash" (kosten 16384). Werkt gewoon, en bij het volgende
  // wachtwoord dat iemand kiest, wordt het vanzelf het nieuwe formaat.
  const [zout, hash] = opgeslagen.split(":")
  if (!zout || !hash) return false
  const berekend = scryptSync(wachtwoord, zout, 64)
  const verwacht = Buffer.from(hash, "hex")
  if (berekend.length !== verwacht.length) return false
  return timingSafeEqual(berekend, verwacht)
}

export function alleRechten(): Record<string, Record<string, boolean>> {
  const resultaat: Record<string, Record<string, boolean>> = {}
  for (const onderdeel of RECHTEN_ONDERDELEN) {
    resultaat[onderdeel.sleutel] = {}
    for (const actie of RECHTEN_ACTIES) resultaat[onderdeel.sleutel][actie] = true
  }
  return resultaat
}

export function leesCookie(req: Request, naam: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const deel of header.split(";")) {
    const [sleutel, ...rest] = deel.trim().split("=")
    if (sleutel === naam) return decodeURIComponent(rest.join("="))
  }
  return undefined
}

export async function sessieGebruiker(req: Request): Promise<Gebruiker | undefined> {
  const token = leesCookie(req, SESSIE_COOKIE)
  if (!token) return undefined
  const rij = await een<{
    token: string
    gebruiker_id: number
    laatst_gebruikt: Date
    verloopt: Date
    naam: string
    email: string
    actief: boolean
    rol_id: number
    rol_naam: string
    rechten: Record<string, Record<string, boolean>>
    twee_staps: boolean
  }>(
    `select s.token, s.gebruiker_id, s.laatst_gebruikt, s.verloopt,
            g.naam, g.email, g.actief, g.rol_id, g.twee_staps,
            r.naam as rol_naam, r.rechten
       from sessies s
       join gebruikers g on g.id = s.gebruiker_id
       join rollen r on r.id = g.rol_id
      where s.token = $1`,
    [token],
  )
  if (!rij) return undefined
  const nu = Date.now()
  const inactiefSinds = nu - new Date(rij.laatst_gebruikt).getTime()
  if (new Date(rij.verloopt).getTime() < nu || inactiefSinds > INACTIVITEIT_MINUTEN * 60_000) {
    await q("delete from sessies where token = $1", [token])
    return undefined
  }
  if (inactiefSinds > 60_000) {
    await q("update sessies set laatst_gebruikt = now() where token = $1", [token])
  }
  if (!rij.actief) return undefined
  return {
    id: rij.gebruiker_id,
    naam: rij.naam,
    email: rij.email,
    rol_id: rij.rol_id,
    rol_naam: rij.rol_naam,
    rechten: rij.rechten ?? {},
    actief: rij.actief,
    twee_staps: rij.twee_staps,
  }
}

export async function nieuweSessie(gebruikerId: number): Promise<{
  token: string
  verloopt: Date
}> {
  const token = randomBytes(32).toString("hex")
  const verloopt = new Date(Date.now() + SESSIE_UREN * 60 * 60 * 1000)
  // Verlopen sessies opruimen, zodat de tabel niet onbeperkt groeit.
  await q("delete from sessies where verloopt < now()")
  await q("insert into sessies (token, gebruiker_id, verloopt) values ($1, $2, $3)", [
    token,
    gebruikerId,
    verloopt,
  ])
  return { token, verloopt }
}

/** De preview en de productieomgeving draaien op https; dan mag de cookie dat ook eisen. */
export function isHttps(req: Request): boolean {
  const doorgestuurd = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim()
  return req.secure || doorgestuurd === "https"
}

export function zetSessieCookie(req: Request, res: Response, token: string, verloopt: Date) {
  res.cookie(SESSIE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    expires: verloopt,
    path: "/",
  })
}

export function mag(
  gebruiker: Gebruiker | undefined,
  onderdeel: string,
  actie: RechtActie,
): boolean {
  if (!gebruiker) return false
  if (gebruiker.rol_naam === "Admin") return true
  return gebruiker.rechten?.[onderdeel]?.[actie] === true
}

/** Vereist een ingelogde gebruiker. */
export async function vereisLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const gebruiker = await sessieGebruiker(req)
    if (!gebruiker) {
      res.status(401).json({ fout: "Niet ingelogd. Log opnieuw in." })
      return
    }
    req.gebruiker = gebruiker
    next()
  } catch (fout) {
    next(fout)
  }
}

/** Vereist een recht op een onderdeel. */
export function vereisRecht(onderdeel: string, actie: RechtActie) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!mag(req.gebruiker, onderdeel, actie)) {
      res.status(403).json({
        fout: "Je hebt geen rechten voor deze actie. Vraag de beheerder om toegang.",
      })
      return
    }
    next()
  }
}
