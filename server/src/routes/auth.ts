import { Router, type Response } from "express"
import { randomInt } from "node:crypto"
import { een, q } from "../db"
import {
  controleerWachtwoord,
  hashWachtwoord,
  leesCookie,
  nieuweSessie,
  SESSIE_COOKIE,
  sessieGebruiker,
  vereisLogin,
  wachtwoordFout,
  WACHTWOORD_MAX_LENGTE,
  zetSessieCookie,
} from "../auth"
import { registreerPoging, teVaakGeprobeerd, veiligeVergelijking, wisPogingen } from "../limiet"
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
    thema: (await een<{ waarde: string }>("select waarde from instellingen where sleutel = 'thema'"))?.waarde ?? "rood",
  }
}

const PREVIEW = process.env.BASE44_PREVIEW_MODE === "1"

/**
 * Inlog- en herstelcodes staan gehasht in de database, net als wachtwoorden.
 * Een code van het oude formaat (zes cijfers zonder hash) blijft werken tot hij
 * verloopt, zodat een draaiende omgeving niet ineens iedereen buitensluit.
 */
function hashCode(code: string): string {
  return hashWachtwoord(code)
}

function controleerCode(opgeslagen: string, code: string): boolean {
  if (opgeslagen.includes("$")) return controleerWachtwoord(code, opgeslagen)
  return veiligeVergelijking(opgeslagen, code)
}

/** Zet een code in de mailwachtrij; in de preview tonen we hem liever direct op het scherm. */
async function mailCode(email: string, onderwerp: string, tekst: string): Promise<void> {
  await q(
    `insert into email_outbox (email, onderwerp, tekst, status) values ($1,$2,$3,'in_wachtrij')`,
    [email, onderwerp, tekst],
  )
}

/** Voor een onbekend e-mailadres doen we toch rekenwerk, zodat de reactietijd niets verraadt. */
const NEP_HASH = hashWachtwoord("nep-wachtwoord-voor-gelijke-reactietijd")

/** Te veel mislukte pogingen? Dan krijgt de client een 429 met een wachttijd. */
function stuurTeVaak(res: Response, seconden: number) {
  res.setHeader("Retry-After", String(seconden))
  stuurFout(
    res,
    429,
    `Te veel pogingen achter elkaar. Probeer het over ${Math.ceil(seconden / 60)} minuut/minuten opnieuw.`,
  )
}

authRouter.post(
  "/login",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().slice(0, 254)
    const wachtwoord = String(req.body?.wachtwoord ?? "").slice(0, WACHTWOORD_MAX_LENGTE)
    if (!email || !wachtwoord) {
      stuurFout(res, 400, "Vul je e-mailadres en wachtwoord in.")
      return
    }
    const emailSleutel = `login:email:${email.toLowerCase()}`
    const ipSleutel = `login:ip:${req.ip ?? "onbekend"}`
    // Ruim per adres, strakker per e-mailadres: zo blokkeert één drukke locatie niet meteen iedereen.
    const wacht = Math.max(teVaakGeprobeerd(emailSleutel, 5, 15), teVaakGeprobeerd(ipSleutel, 50, 15))
    if (wacht > 0) {
      stuurTeVaak(res, wacht)
      return
    }
    const gebruiker = await gebruikerBijEmail(email)
    const wachtwoordJuist = gebruiker
      ? controleerWachtwoord(wachtwoord, gebruiker.wachtwoord_hash)
      : !controleerWachtwoord(wachtwoord, NEP_HASH)
    if (!gebruiker || !wachtwoordJuist) {
      registreerPoging(emailSleutel)
      registreerPoging(ipSleutel)
      stuurFout(res, 401, "E-mailadres of wachtwoord is niet juist.")
      return
    }
    wisPogingen(emailSleutel)
    if (!gebruiker.actief) {
      stuurFout(res, 403, "Dit account is uitgeschakeld. Neem contact op met de beheerder.")
      return
    }
    if (gebruiker.twee_staps) {
      const code = String(randomInt(100000, 999999))
      await q(
        `update gebruikers set twee_staps_code = $1, twee_staps_verloopt = now() + interval '10 minutes'
          where id = $2`,
        [hashCode(code), gebruiker.id],
      )
      // In de previewomgeving is er geen mailserver; dan tonen we de code zodat de app bruikbaar is.
      // Daarbuiten gaat de code naar de mailwachtrij, zodat hij echt verstuurd kan worden.
      if (!PREVIEW) {
        await mailCode(
          gebruiker.email,
          "Je inlogcode voor het beheersysteem",
          `Je inlogcode is ${code}. De code is 10 minuten geldig. Heb je niet geprobeerd in te loggen? Neem contact op met de beheerder.`,
        )
      }
      res.json({ twee_staps: true, code: PREVIEW ? code : undefined })
      return
    }
    const sessie = await nieuweSessie(gebruiker.id)
    await q("update gebruikers set laatste_login = now() where id = $1", [gebruiker.id])
    zetSessieCookie(req, res, sessie.token, sessie.verloopt)
    // Zodat het actielogboek weet wie er inlogde.
    req.gebruiker = gebruiker
    res.json({ gebruiker: await gebruikerAntwoord(gebruiker.id) })
  }),
)

authRouter.post(
  "/twee-staps",
  ah(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().slice(0, 254)
    const code = String(req.body?.code ?? "").trim().slice(0, 10)
    const codeSleutel = `twee-staps:${email.toLowerCase()}`
    const wacht = teVaakGeprobeerd(codeSleutel, 5, 15)
    if (wacht > 0) {
      stuurTeVaak(res, wacht)
      return
    }
    const gebruiker = await gebruikerBijEmail(email)
    if (!gebruiker || !gebruiker.twee_staps_code || !controleerCode(gebruiker.twee_staps_code, code)) {
      registreerPoging(codeSleutel)
      // Na vijf foute codes de code laten vervallen, zodat doorgaan geen zin heeft.
      if (teVaakGeprobeerd(codeSleutel, 5, 15) > 0 && gebruiker) {
        await q("update gebruikers set twee_staps_code = null, twee_staps_verloopt = null where id = $1", [
          gebruiker.id,
        ])
      }
      stuurFout(res, 401, "De code klopt niet. Vraag een nieuwe code aan.")
      return
    }
    if (!gebruiker.twee_staps_verloopt || new Date(gebruiker.twee_staps_verloopt).getTime() < Date.now()) {
      stuurFout(res, 401, "De code is verlopen. Log opnieuw in.")
      return
    }
    wisPogingen(codeSleutel)
    await q("update gebruikers set twee_staps_code = null, twee_staps_verloopt = null where id = $1", [
      gebruiker.id,
    ])
    const sessie = await nieuweSessie(gebruiker.id)
    await q("update gebruikers set laatste_login = now() where id = $1", [gebruiker.id])
    zetSessieCookie(req, res, sessie.token, sessie.verloopt)
    // Zodat het actielogboek weet wie er inlogde.
    req.gebruiker = gebruiker
    res.json({ gebruiker: await gebruikerAntwoord(gebruiker.id) })
  }),
)

authRouter.post(
  "/uitloggen",
  ah(async (req, res) => {
    const huidige = await sessieGebruiker(req)
    if (huidige) req.gebruiker = huidige
    const token = leesCookie(req, SESSIE_COOKIE)
    if (token) await q("delete from sessies where token = $1", [token])
    res.clearCookie(SESSIE_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" })
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
    const email = String(req.body?.email ?? "").trim().slice(0, 254)
    const vraagSleutel = `herstel-vragen:${email.toLowerCase()}`
    // Altijd hetzelfde antwoord, ook als het adres niet bestaat (geen e-mailadressen lekken)
    // en ook als er te vaak is gevraagd; alleen dan sturen we geen nieuwe code.
    const teVaak =
      teVaakGeprobeerd(vraagSleutel, 3, 15) > 0 ||
      teVaakGeprobeerd(`herstel-vragen:ip:${req.ip ?? "onbekend"}`, 10, 15) > 0
    const gebruiker = teVaak ? undefined : await gebruikerBijEmail(email)
    registreerPoging(`herstel-vragen:ip:${req.ip ?? "onbekend"}`)
    if (email) registreerPoging(vraagSleutel)
    if (gebruiker && gebruiker.actief) {
      const code = String(randomInt(100000, 999999))
      await q(
        `update gebruikers set reset_code = $1, reset_verloopt = now() + interval '30 minutes'
          where id = $2`,
        [hashCode(code), gebruiker.id],
      )
      if (!PREVIEW) {
        await mailCode(
          gebruiker.email,
          "Je herstelcode voor het beheersysteem",
          `Je herstelcode is ${code}. De code is 30 minuten geldig. Heb je geen nieuw wachtwoord aangevraagd? Negeer deze e-mail dan.`,
        )
      }
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
    const email = String(req.body?.email ?? "").trim().slice(0, 254)
    const code = String(req.body?.code ?? "").trim().slice(0, 10)
    const nieuw = String(req.body?.nieuw_wachtwoord ?? "")
    const beleid = wachtwoordFout(nieuw)
    if (beleid) {
      stuurFout(res, 400, beleid)
      return
    }
    const herstelSleutel = `herstel-code:${email.toLowerCase()}`
    const wacht = teVaakGeprobeerd(herstelSleutel, 5, 15)
    if (wacht > 0) {
      stuurTeVaak(res, wacht)
      return
    }
    const gebruiker = await gebruikerBijEmail(email)
    if (!gebruiker || !gebruiker.reset_code || !controleerCode(gebruiker.reset_code, code)) {
      registreerPoging(herstelSleutel)
      stuurFout(res, 400, "De herstelcode klopt niet.")
      return
    }
    if (!gebruiker.reset_verloopt || new Date(gebruiker.reset_verloopt).getTime() < Date.now()) {
      stuurFout(res, 400, "De herstelcode is verlopen. Vraag een nieuwe aan.")
      return
    }
    wisPogingen(herstelSleutel)
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
