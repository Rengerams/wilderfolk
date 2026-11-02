import { Router, type Response } from "express"
import { randomInt } from "node:crypto"
import { een, q } from "../db"
import {
  controleerWachtwoord,
  hashWachtwoord,
  leesCookie,
  nieuweSessie,
  SESSIE_COOKIE,
  vereisLogin,
} from "../auth"
import { logWijziging } from "../audit"
import { functiesVoorGebruiker } from "../functies"
import { ah, stuurFout } from "../util"

export const authRouter = Router()

type GebruikerRij = {
  id: number
  naam: string
  email: string
  wachtwoord_hash: string
  actief: boolean
  twee_staps: boolean
  twee_staps_code: string | null
  twee_staps_verloopt: Date | null
  reset_code: string | null
  reset_verloopt: Date | null
  rol_id: number
  rol_naam: string
  rechten: Record<string, Record<string, boolean>>
}

async function gebruikerBijEmail(email: string): Promise<GebruikerRij | undefined> {
  return een<GebruikerRij>(
    `select g.*, r.naam as rol_naam, r.rechten
       from gebruikers g join rollen r on r.id = g.rol_id
      where lower(g.email) = lower($1)`,
    [email],
  )
}

async function gebruikerAntwoord(id: number) {
  const rij = await een<{
    id: number
    naam: string
    email: string
    rol_naam: string
    rechten: Record<string, Record<string, boolean>>
    twee_staps: boolean
  }>(
    `select g.id, g.naam, g.email, g.twee_staps, r.naam as rol_naam, r.rechten
       from gebruikers g join rollen r on r.id = g.rol_id where g.id = $1`,
    [id],
  )
  return {
    id: rij!.id,
    naam: rij!.naam,
    email: rij!.email,
    rol: rij!.rol_naam,
    rechten: rij!.rechten,
    twee_staps: rij!.twee_staps,
    modules: await functiesVoorGebruiker(rij!.id),
  }
}

function zetSessieCookie(res: Response, token: string, verloopt: Date) {
  res.cookie(SESSIE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    expires: verloopt,
    path: "/",
  })
}

const PREVIEW = process.env.BASE44_PREVIEW_MODE === "1"

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim()
    const wachtwoord = String(req.body?.wachtwoord ?? "")
    if (!email || !wachtwoord) {
      stuurFout(res, 400, "Vul je e-mailadres en wachtwoord in.")
      return
    }
    const gebruiker = await gebruikerBijEmail(email)
    if (!gebruiker || !controleerWachtwoord(wachtwoord, gebruiker.wachtwoord_hash)) {
      stuurFout(res, 401, "E-mailadres of wachtwoord is niet juist.")
      return
    }
    if (!gebruiker.actief) {
      stuurFout(res, 403, "Dit account is uitgeschakeld. Neem contact op met de beheerder.")
      return
    }
    if (gebruiker.twee_staps) {
      const code = String(randomInt(100000, 999999))
      await q(
        `update gebruikers set twee_staps_code = $1, twee_staps_verloopt = now() + interval '10 minutes'
          where id = $2`,
        [code, gebruiker.id],
      )
      // In de previewomgeving is er geen mailserver; dan tonen we de code zodat de app bruikbaar is.
      res.json({ twee_staps: true, code: PREVIEW ? code : undefined })
      return
    }
    const sessie = await nieuweSessie(gebruiker.id)
    await q("update gebruikers set laatste_login = now() where id = $1", [gebruiker.id])
    zetSessieCookie(res, sessie.token, sessie.verloopt)
    res.json({ gebruiker: await gebruikerAntwoord(gebruiker.id) })
  }),
)

authRouter.post(
  "/twee-staps",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim()
    const code = String(req.body?.code ?? "").trim()
    const gebruiker = await gebruikerBijEmail(email)
    if (!gebruiker || !gebruiker.twee_staps_code || gebruiker.twee_staps_code !== code) {
      stuurFout(res, 401, "De code klopt niet. Vraag een nieuwe code aan.")
      return
    }
    if (!gebruiker.twee_staps_verloopt || new Date(gebruiker.twee_staps_verloopt).getTime() < Date.now()) {
      stuurFout(res, 401, "De code is verlopen. Log opnieuw in.")
      return
    }
    await q("update gebruikers set twee_staps_code = null, twee_staps_verloopt = null where id = $1", [
      gebruiker.id,
    ])
    const sessie = await nieuweSessie(gebruiker.id)
    await q("update gebruikers set laatste_login = now() where id = $1", [gebruiker.id])
    zetSessieCookie(res, sessie.token, sessie.verloopt)
    res.json({ gebruiker: await gebruikerAntwoord(gebruiker.id) })
  }),
)

authRouter.post(
  "/uitloggen",
  ah(async (req, res) => {
    const token = leesCookie(req, SESSIE_COOKIE)
    if (token) await q("delete from sessies where token = $1", [token])
    res.clearCookie(SESSIE_COOKIE, { path: "/" })
    res.json({ gelukt: true })
  }),
)

authRouter.get(
  "/ik",
  vereisLogin,
  ah(async (req, res) => {
    res.json({ gebruiker: await gebruikerAntwoord(req.gebruiker!.id) })
  }),
)

authRouter.post(
  "/wachtwoord-vergeten",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim()
    const gebruiker = await gebruikerBijEmail(email)
    // Altijd hetzelfde antwoord, ook als het adres niet bestaat (geen e-mailadressen lekken).
    if (gebruiker && gebruiker.actief) {
      const code = String(randomInt(100000, 999999))
      await q(
        `update gebruikers set reset_code = $1, reset_verloopt = now() + interval '30 minutes'
          where id = $2`,
        [code, gebruiker.id],
      )
      res.json({
        bericht: "Als dit e-mailadres bekend is, hebben we een herstelcode gestuurd.",
        code: PREVIEW ? code : undefined,
      })
      return
    }
    res.json({ bericht: "Als dit e-mailadres bekend is, hebben we een herstelcode gestuurd." })
  }),
)

authRouter.post(
  "/wachtwoord-herstellen",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim()
    const code = String(req.body?.code ?? "").trim()
    const nieuw = String(req.body?.nieuw_wachtwoord ?? "")
    if (nieuw.length < 8) {
      stuurFout(res, 400, "Kies een wachtwoord van minstens 8 tekens.")
      return
    }
    const gebruiker = await gebruikerBijEmail(email)
    if (!gebruiker || !gebruiker.reset_code || gebruiker.reset_code !== code) {
      stuurFout(res, 400, "De herstelcode klopt niet.")
      return
    }
    if (!gebruiker.reset_verloopt || new Date(gebruiker.reset_verloopt).getTime() < Date.now()) {
      stuurFout(res, 400, "De herstelcode is verlopen. Vraag een nieuwe aan.")
      return
    }
    await q(
      `update gebruikers set wachtwoord_hash = $1, reset_code = null, reset_verloopt = null where id = $2`,
      [hashWachtwoord(nieuw), gebruiker.id],
    )
    await q("delete from sessies where gebruiker_id = $1", [gebruiker.id])
    await logWijziging(undefined, {
      actie: "wachtwoord-herstellen",
      entiteit: "gebruiker",
      entiteitId: gebruiker.id,
      omschrijving: `${gebruiker.naam} heeft het wachtwoord opnieuw ingesteld.`,
    })
    res.json({ bericht: "Je wachtwoord is aangepast. Je kunt nu inloggen." })
  }),
)
