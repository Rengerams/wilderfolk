import { Router } from "express"
import { een, q } from "../db"
import { hashWachtwoord, mag, vereisRecht, wachtwoordFout } from "../auth"
import { logWijziging } from "../audit"
import { functieAan } from "../functies"
import { RECHTEN_ACTIES, RECHTEN_ONDERDELEN } from "../schema"
import { ah, alsGetal, datumLang, moduleAan, stuurFout, veiligeTekst, vandaag } from "../util"

export const beheerRouter = Router()

// ---------------------------------------------------------------- dashboard

beheerRouter.get(
  "/dashboard",
  ah(async (req, res) => {
    const vandaagDatum = vandaag()
    const periode = await een<{
      id: number
      naam: string
      start_op: string
      eind_op: string
      aanmelddeadline: string
      status: string
      standaard_capaciteit: number
    }>(
      `select * from periodes
        where eind_op >= current_date - interval '14 days'
        order by case when start_op <= current_date and eind_op >= current_date then 0 else 1 end,
                 start_op
        limit 1`,
    )
    let taak: { titel: string; uitleg: string; link: string; knop: string } | null = null
    let cijfers = {
      deelnemers: 0,
      uitjes: 0,
      opgaven: 0,
      teBellen: 0,
      declaratiesTeBeoordelen: 0,
      nieuweFeedback: 0,
    }
    if (periode) {
      const uitjes = await een<{ aantal: string }>(
        "select count(*)::text as aantal from uitjes where periode_id = $1 and status = 'actief'",
        [periode.id],
      )
      const opgaven = await een<{ aantal: string }>(
        `select count(*)::text as aantal from opgaven o join uitjes u on u.id = o.uitje_id
          where u.periode_id = $1`,
        [periode.id],
      )
      const teBellen = await een<{ aantal: string }>(
        "select count(*)::text as aantal from bellijst where periode_id = $1 and status = 'te_bellen'",
        [periode.id],
      )
      const definitief = await een<{ id: number }>(
        "select id from indeling_runs where periode_id = $1 and modus = 'definitief' order by id desc limit 1",
        [periode.id],
      )
      const proef = await een<{ id: number }>(
        "select id from indeling_runs where periode_id = $1 order by id desc limit 1",
        [periode.id],
      )
      if (periode.status === "concept") {
        taak = {
          titel: "Programma klaarzetten",
          uitleg: `Periode "${periode.naam}" is nog niet gepubliceerd. Voeg de uitjes toe en open daarna de opgave.`,
          link: `/programma/${periode.id}`,
          knop: "Naar het programma",
        }
      } else if (periode.status === "gepubliceerd" && vandaagDatum <= periode.aanmelddeadline) {
        taak = {
          titel: "Beschikbaarheid cliënten doorgeven",
          uitleg: "",
          link: "/opgave",
          knop: "Beschikbaarheid invoeren",
        }
      } else if (!definitief && !proef) {
        taak = {
          titel: "De indeling maken",
          uitleg: `De opgave is gesloten. Bereken nu een eerlijk voorstel en bekijk de uitleg per plek.`,
          link: `/indeling/${periode.id}`,
          knop: "Naar de indeling",
        }
      } else if (!definitief) {
        taak = {
          titel: "Het voorstel controleren",
          uitleg: "Er is een voorstel berekend. Vergelijk het met de handmatige indeling en bevestig daarna.",
          link: `/indeling/${periode.id}`,
          knop: "Voorstel bekijken",
        }
      } else if (Number(teBellen?.aantal ?? 0) > 0) {
        taak = {
          titel: "Mensen bellen",
          uitleg: `Er staan ${teBellen?.aantal} mensen op de bellijst. Werk de lijst af en noteer wat er is afgesproken.`,
          link: `/bellijst?periode=${periode.id}`,
          knop: "Naar de bellijst",
        }
      } else {
        taak = {
          titel: "Alles is bijgewerkt",
          uitleg: "De indeling is bevestigd en de bellijst is leeg. Nieuwe wijzigingen komen hier vanzelf weer bovenaan.",
          link: `/programma/${periode.id}`,
          knop: "Programma bekijken",
        }
      }
      cijfers = {
        ...cijfers,
        uitjes: Number(uitjes?.aantal ?? 0),
        opgaven: Number(opgaven?.aantal ?? 0),
        teBellen: Number(teBellen?.aantal ?? 0),
      }
    }
    const deelnemers = await een<{ aantal: string }>(
      "select count(*)::text as aantal from deelnemers where status = 'actief' and geanonimiseerd = false",
    )
    const teBeoordelen = await een<{ aantal: string }>(
      "select count(*)::text as aantal from declaraties where status = 'ingediend'",
    )
    const feedback = await een<{ aantal: string }>(
      "select count(*)::text as aantal from feedback where status = 'nieuw'",
    )
    const aankomendeUitjes = periode
      ? await q<{
          id: number
          datum: string
          begin_tijd: string | null
          omschrijving: string
          capaciteit: number
          geplaatst: number
        }>(
          `select u.id, u.datum, u.begin_tijd, u.omschrijving, u.capaciteit,
                  coalesce((
                    select count(*) from indeling_rijen r
                     where r.uitje_id = u.id and r.status = 'geplaatst'
                       and r.run_id = (select max(id) from indeling_runs
                                        where periode_id = u.periode_id and modus = 'definitief')
                  ), 0)::int as geplaatst
             from uitjes u
            where u.periode_id = $1 and u.status = 'actief' and u.datum >= current_date
            order by u.datum
            limit 5`,
          [periode.id],
        )
      : []
    const recenteWijzigingen = mag(req.gebruiker, "logboek", "zien")
      ? await q<{ tijd: string; gebruiker_naam: string; omschrijving: string }>(
          `select tijd, gebruiker_naam, omschrijving from audit_log order by tijd desc limit 4`,
        )
      : []
    res.json({
      taak,
      periode: periode ?? null,
      aankomendeUitjes,
      recenteWijzigingen,
      cijfers: {
        ...cijfers,
        deelnemers: Number(deelnemers?.aantal ?? 0),
        declaratiesTeBeoordelen: mag(req.gebruiker, "declaraties", "zien")
          ? Number(teBeoordelen?.aantal ?? 0)
          : 0,
        nieuweFeedback: mag(req.gebruiker, "feedback", "zien") ? Number(feedback?.aantal ?? 0) : 0,
      },
      vandaag: vandaagDatum,
    })
  }),
)

// ---------------------------------------------------------------- gebruikers

beheerRouter.get(
  "/gebruikers",
  vereisRecht("gebruikers", "zien"),
  ah(async (_req, res) => {
    const gebruikers = await q(
      `select g.id, g.naam, g.email, g.actief, g.twee_staps, g.laatste_login, g.created_at,
              r.id as rol_id, r.naam as rol_naam
         from gebruikers g join rollen r on r.id = g.rol_id order by g.naam`,
    )
    const rollen = await q("select id, naam, beschrijving, standaard from rollen order by naam")
    res.json({ gebruikers, rollen })
  }),
)

beheerRouter.post(
  "/gebruikers",
  vereisRecht("gebruikers", "aanmaken"),
  ah(async (req, res) => {
    const naamGebruiker = veiligeTekst(req.body?.naam)
    const email = veiligeTekst(req.body?.email).toLowerCase()
    const wachtwoord = String(req.body?.wachtwoord ?? "")
    const rolId = Number(req.body?.rol_id)
    if (!naamGebruiker || !email || !wachtwoord || !rolId) {
      stuurFout(res, 400, "Vul een naam, e-mailadres, wachtwoord en rol in.")
      return
    }
    const beleid = wachtwoordFout(wachtwoord)
    if (beleid) {
      stuurFout(res, 400, beleid)
      return
    }
    const bestaat = await een("select 1 from gebruikers where lower(email) = $1", [email])
    if (bestaat) {
      stuurFout(res, 409, "Er bestaat al een account met dit e-mailadres.")
      return
    }
    const rij = await een<{ id: number; naam: string }>(
      `insert into gebruikers (naam, email, wachtwoord_hash, rol_id, twee_staps)
       values ($1,$2,$3,$4,$5) returning id, naam`,
      [naamGebruiker, email, hashWachtwoord(wachtwoord), rolId, req.body?.twee_staps === true],
    )
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "gebruiker",
      entiteitId: rij!.id,
      omschrijving: `${req.gebruiker!.naam} heeft een account aangemaakt voor ${naamGebruiker}.`,
    })
    res.status(201).json({ gebruiker: rij })
  }),
)

beheerRouter.patch(
  "/gebruikers/:id",
  vereisRecht("gebruikers", "wijzigen"),
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const bestaand = await een<{
      id: number
      naam: string
      email: string
      actief: boolean
      rol_id: number
      rol_naam: string
      twee_staps: boolean
    }>(
      `select g.*, r.naam as rol_naam from gebruikers g join rollen r on r.id = g.rol_id where g.id = $1`,
      [id],
    )
    if (!bestaand) {
      stuurFout(res, 404, "Dit account bestaat niet.")
      return
    }
    if (bestaand.id === req.gebruiker!.id && req.body?.actief === false) {
      stuurFout(res, 400, "Je kunt je eigen account niet uitschakelen.")
      return
    }
    const nieuwWachtwoord = veiligeTekst(req.body?.wachtwoord)
    if (nieuwWachtwoord) {
      const beleid = wachtwoordFout(nieuwWachtwoord)
      if (beleid) {
        stuurFout(res, 400, beleid)
        return
      }
    }
    const bijgewerkt = await een(
      `update gebruikers set naam = $1, email = $2, rol_id = $3, actief = $4, twee_staps = $5,
         wachtwoord_hash = coalesce($6, wachtwoord_hash)
       where id = $7 returning id, naam, email, rol_id, actief, twee_staps`,
      [
        veiligeTekst(req.body?.naam) || bestaand.naam,
        veiligeTekst(req.body?.email).toLowerCase() || bestaand.email,
        Number(req.body?.rol_id) || bestaand.rol_id,
        typeof req.body?.actief === "boolean" ? req.body.actief : bestaand.actief,
        typeof req.body?.twee_staps === "boolean" ? req.body.twee_staps : bestaand.twee_staps,
        nieuwWachtwoord ? hashWachtwoord(nieuwWachtwoord) : null,
        id,
      ],
    )
    if (req.body?.actief === false) {
      await q("delete from sessies where gebruiker_id = $1", [id])
    }
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "gebruiker",
      entiteitId: id,
      oudeWaarde: bestaand,
      nieuweWaarde: bijgewerkt,
      omschrijving:
        req.body?.actief === false
          ? `${req.gebruiker!.naam} heeft het account van ${bestaand.naam} uitgeschakeld (niet verwijderd, zodat het logboek klopt).`
          : `${req.gebruiker!.naam} heeft het account van ${bestaand.naam} gewijzigd${nieuwWachtwoord ? " en een nieuw wachtwoord ingesteld" : ""}.`,
    })
    res.json({ gebruiker: bijgewerkt })
  }),
)

// ---------------------------------------------------------------- rollen

beheerRouter.get(
  "/rollen",
  vereisRecht("rollen", "zien"),
  ah(async (_req, res) => {
    const rollen = await q(
      `select r.*, (select count(*) from gebruikers g where g.rol_id = r.id)::int as aantal_gebruikers
         from rollen r order by r.standaard desc, r.naam`,
    )
    res.json({
      rollen,
      onderdelen: RECHTEN_ONDERDELEN,
      acties: RECHTEN_ACTIES,
    })
  }),
)

function normaliseerRechten(invoer: unknown): Record<string, Record<string, boolean>> {
  const bron = (invoer ?? {}) as Record<string, Record<string, unknown>>
  const resultaat: Record<string, Record<string, boolean>> = {}
  for (const onderdeel of RECHTEN_ONDERDELEN) {
    resultaat[onderdeel.sleutel] = {}
    for (const actie of RECHTEN_ACTIES) {
      resultaat[onderdeel.sleutel][actie] = bron?.[onderdeel.sleutel]?.[actie] === true
    }
  }
  return resultaat
}

beheerRouter.post(
  "/rollen",
  vereisRecht("rollen", "aanmaken"),
  ah(async (req, res) => {
    const rolNaam = veiligeTekst(req.body?.naam)
    if (!rolNaam) {
      stuurFout(res, 400, "Geef de rol een naam.")
      return
    }
    const bestaat = await een<{ id: number }>("select id from rollen where lower(naam) = lower($1)", [
      rolNaam,
    ])
    if (bestaat) {
      stuurFout(res, 409, "Er bestaat al een rol met deze naam.")
      return
    }
    const rij = await een(
      `insert into rollen (naam, beschrijving, rechten, standaard)
       values ($1,$2,$3,false) returning *`,
      [rolNaam, veiligeTekst(req.body?.beschrijving) || null, JSON.stringify(normaliseerRechten(req.body?.rechten))],
    )
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "rol",
      entiteitId: (rij as { id: number }).id,
      omschrijving: `${req.gebruiker!.naam} heeft rol "${rolNaam}" aangemaakt.`,
    })
    res.status(201).json({ rol: rij })
  }),
)

beheerRouter.patch(
  "/rollen/:id",
  vereisRecht("rollen", "wijzigen"),
  ah(async (req, res) => {
    const rij = await een<{ id: number; naam: string; rechten: unknown }>(
      "select * from rollen where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze rol bestaat niet.")
      return
    }
    const nieuweRechten =
      req.body?.rechten !== undefined ? normaliseerRechten(req.body.rechten) : rij.rechten
    const nieuweNaam = veiligeTekst(req.body?.naam) || rij.naam
    const dubbel = await een<{ id: number }>(
      "select id from rollen where lower(naam) = lower($1) and id <> $2",
      [nieuweNaam, rij.id],
    )
    if (dubbel) {
      stuurFout(res, 409, "Er bestaat al een rol met deze naam.")
      return
    }
    const bijgewerkt = await een(
      `update rollen set naam = $1, beschrijving = $2, rechten = $3 where id = $4 returning *`,
      [
        nieuweNaam,
        veiligeTekst(req.body?.beschrijving) || null,
        JSON.stringify(nieuweRechten),
        rij.id,
      ],
    )
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "rol",
      entiteitId: rij.id,
      oudeWaarde: rij,
      nieuweWaarde: bijgewerkt,
      omschrijving: `${req.gebruiker!.naam} heeft de rechten van rol "${rij.naam}" aangepast.`,
    })
    res.json({ rol: bijgewerkt })
  }),
)

// ---------------------------------------------------------------- modules

beheerRouter.get(
  "/modules",
  vereisRecht("modules", "zien"),
  ah(async (_req, res) => {
    const modules = await q("select * from modules order by volgorde")
    res.json({ modules })
  }),
)

beheerRouter.patch(
  "/modules/:sleutel",
  vereisRecht("modules", "wijzigen"),
  ah(async (req, res) => {
    const sleutel = veiligeTekst(req.params.sleutel)
    const module = await een<{ sleutel: string; naam: string; aan: boolean }>(
      "select * from modules where sleutel = $1",
      [sleutel],
    )
    if (!module) {
      stuurFout(res, 404, "Deze module bestaat niet.")
      return
    }
    const aan = req.body?.aan === true
    if (sleutel === "kas" && aan && !(await moduleAan("chauffeurskosten"))) {
      stuurFout(res, 400, "De module Kas kan alleen aan als Chauffeurskosten aan staat.")
      return
    }
    await q("update modules set aan = $1 where sleutel = $2", [aan, sleutel])
    await logWijziging(req, {
      actie: "module-wijzigen",
      entiteit: "module",
      entiteitId: sleutel,
      oudeWaarde: { aan: module.aan },
      nieuweWaarde: { aan },
      omschrijving: `${req.gebruiker!.naam} heeft de module "${module.naam}" ${aan ? "aangezet" : "uitgezet"}. Bestaande gegevens blijven bewaard.`,
    })
    const modules = await q("select * from modules order by volgorde")
    res.json({ modules })
  }),
)

// ---------------------------------------------------------------- functies per gebruiker

beheerRouter.get(
  "/gebruikers/:id/functies",
  vereisRecht("gebruikers", "zien"),
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const gebruiker = await een<{ id: number; naam: string; rol_naam: string }>(
      `select g.id, g.naam, r.naam as rol_naam from gebruikers g
         join rollen r on r.id = g.rol_id where g.id = $1`,
      [id],
    )
    if (!gebruiker) {
      stuurFout(res, 404, "Dit account bestaat niet.")
      return
    }
    const functies = await q<{
      sleutel: string
      naam: string
      uitleg: string
      aan: boolean
      globaal: boolean
    }>(
      `select m.sleutel, m.naam, m.uitleg, coalesce(g.aan, m.aan) as aan, m.aan as globaal
         from modules m
         left join gebruiker_functies g on g.functie = m.sleutel and g.gebruiker_id = $1
        order by m.volgorde`,
      [id],
    )
    res.json({ gebruiker, functies })
  }),
)

beheerRouter.patch(
  "/gebruikers/:id/functies",
  vereisRecht("gebruikers", "wijzigen"),
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const sleutel = veiligeTekst(req.body?.functie)
    const aan = req.body?.aan
    if (typeof aan !== "boolean") {
      stuurFout(res, 400, "Geef aan of de functie aan of uit moet.")
      return
    }
    const gebruiker = await een<{ id: number; naam: string }>("select id, naam from gebruikers where id = $1", [id])
    const module = await een<{ sleutel: string; naam: string; aan: boolean }>(
      "select sleutel, naam, aan from modules where sleutel = $1",
      [sleutel],
    )
    if (!gebruiker) {
      stuurFout(res, 404, "Dit account bestaat niet.")
      return
    }
    if (!module) {
      stuurFout(res, 404, "Deze functie bestaat niet.")
      return
    }
    if (!module.aan) {
      stuurFout(
        res,
        400,
        `De functie "${module.naam}" staat voor de hele organisatie uit. Zet hem eerst algemeen aan.`,
      )
      return
    }
    await q(
      `insert into gebruiker_functies (gebruiker_id, functie, aan) values ($1,$2,$3)
       on conflict (gebruiker_id, functie) do update set aan = excluded.aan`,
      [id, sleutel, aan],
    )
    await logWijziging(req, {
      actie: "functie-gebruiker",
      entiteit: "gebruiker",
      entiteitId: id,
      nieuweWaarde: { functie: sleutel, aan },
      omschrijving: `${req.gebruiker!.naam} heeft de functie "${module.naam}" ${aan ? "aan" : "uit"} gezet voor ${gebruiker.naam}.`,
    })
    res.json({
      bericht: `De functie "${module.naam}" staat voor ${gebruiker.naam} nu ${aan ? "aan" : "uit"}.`,
    })
  }),
)

// ---------------------------------------------------------------- instellingen

beheerRouter.get(
  "/instellingen",
  vereisRecht("modules", "zien"),
  ah(async (_req, res) => {
    const rijen = await q<{ sleutel: string; waarde: string }>("select * from instellingen order by sleutel")
    res.json({ instellingen: Object.fromEntries(rijen.map((rij) => [rij.sleutel, rij.waarde])) })
  }),
)

beheerRouter.patch(
  "/instellingen",
  vereisRecht("modules", "wijzigen"),
  ah(async (req, res) => {
    const toegestaan = ["standaard_capaciteit", "terugkijk_maanden", "kas_grens", "organisatie_naam", "thema"]
    const themas = ["rood", "blauw", "groen", "paars"]
    for (const sleutel of toegestaan) {
      if (req.body?.[sleutel] === undefined) continue
      if (sleutel === "thema" && !themas.includes(String(req.body[sleutel]))) continue
      await q(
        `insert into instellingen (sleutel, waarde) values ($1,$2)
         on conflict (sleutel) do update set waarde = excluded.waarde`,
        [sleutel, String(req.body[sleutel])],
      )
    }
    await logWijziging(req, {
      actie: "instellingen",
      entiteit: "instelling",
      omschrijving: `${req.gebruiker!.naam} heeft de instellingen aangepast.`,
    })
    res.json({ bericht: "Instellingen opgeslagen." })
  }),
)

// ---------------------------------------------------------------- wijzigingsoverzicht

beheerRouter.get(
  "/logboek",
  vereisRecht("logboek", "zien"),
  ah(async (req, res) => {
    const zoekterm = veiligeTekst(req.query.zoek)
    const entiteit = veiligeTekst(req.query.entiteit)
    const van = veiligeTekst(req.query.van)
    const tot = veiligeTekst(req.query.tot)
    const gebruiker = veiligeTekst(req.query.gebruiker)
    const voorwaarden: string[] = []
    const waarden: unknown[] = []
    if (zoekterm) {
      waarden.push(`%${zoekterm}%`)
      voorwaarden.push(
        `(omschrijving ilike $${waarden.length} or gebruiker_naam ilike $${waarden.length})`,
      )
    }
    if (entiteit) {
      waarden.push(entiteit)
      voorwaarden.push(`entiteit = $${waarden.length}`)
    }
    if (gebruiker) {
      waarden.push(`%${gebruiker}%`)
      voorwaarden.push(`gebruiker_naam ilike $${waarden.length}`)
    }
    if (van) {
      waarden.push(van)
      voorwaarden.push(`tijd >= $${waarden.length}::date`)
    }
    if (tot) {
      waarden.push(tot)
      voorwaarden.push(`tijd < ($${waarden.length}::date + interval '1 day')`)
    }
    const where = voorwaarden.length ? `where ${voorwaarden.join(" and ")}` : ""
    waarden.push(Math.min(500, Math.max(1, alsGetal(req.query.limit, 200))))
    const rijen = await q(
      `select id, tijd, gebruiker_naam, actie, entiteit, entiteit_id, omschrijving, oude_waarde, nieuwe_waarde
         from audit_log ${where} order by tijd desc limit $${waarden.length}`,
      waarden,
    )
    res.json({ rijen })
  }),
)

// ---------------------------------------------------------------- actielogboek

beheerRouter.get(
  "/eventlog",
  vereisRecht("logboek", "zien"),
  ah(async (req, res) => {
    const voorwaarden: string[] = []
    const waarden: unknown[] = []
    const zoekterm = veiligeTekst(req.query.zoek)
    const onderdeel = veiligeTekst(req.query.onderdeel)
    const gebruiker = veiligeTekst(req.query.gebruiker)
    const van = veiligeTekst(req.query.van)
    const tot = veiligeTekst(req.query.tot)
    if (zoekterm) {
      waarden.push(`%${zoekterm}%`)
      voorwaarden.push(
        `(omschrijving ilike $${waarden.length} or gebruiker_naam ilike $${waarden.length} or pad ilike $${waarden.length})`,
      )
    }
    if (onderdeel) {
      waarden.push(onderdeel)
      voorwaarden.push(`onderdeel = $${waarden.length}`)
    }
    if (gebruiker) {
      waarden.push(`%${gebruiker}%`)
      voorwaarden.push(`gebruiker_naam ilike $${waarden.length}`)
    }
    if (van) {
      waarden.push(van)
      voorwaarden.push(`tijd >= $${waarden.length}::date`)
    }
    if (tot) {
      waarden.push(tot)
      voorwaarden.push(`tijd < ($${waarden.length}::date + interval '1 day')`)
    }
    const where = voorwaarden.length ? `where ${voorwaarden.join(" and ")}` : ""
    waarden.push(Math.min(500, Math.max(1, alsGetal(req.query.limit, 200))))
    const rijen = await q(
      `select id, tijd, gebruiker_naam, actie, onderdeel, omschrijving, methode, pad, status, duur_ms
         from event_log ${where} order by tijd desc limit $${waarden.length}`,
      waarden,
    )
    res.json({ rijen })
  }),
)

// ---------------------------------------------------------------- assistent

beheerRouter.post(
  "/assistent",
  ah(async (req, res) => {
    if (!(await functieAan(req.gebruiker!.id, "ai_assistent"))) {
      stuurFout(res, 403, "De assistent staat voor jou uit.")
      return
    }
    const vraag = veiligeTekst(req.body?.vraag)
    if (!vraag) {
      stuurFout(res, 400, "Typ eerst een vraag.")
      return
    }
    if (/(telefoon|adres|e-?mail|wie gaat|deelnemer|nummer|bellen)/i.test(vraag)) {
      res.json({
        antwoord:
          "Ik kan alleen vragen over het programma beantwoorden, bijvoorbeeld over datums, tijden, prijzen en uitjes. Persoonsgegevens van deelnemers kan en mag ik niet inzien.",
      })
      return
    }
    const uitjes = await q<{
      datum: string
      begin_tijd: string | null
      eind_tijd: string | null
      omschrijving: string
      prijs: number
      extra_kosten: string | null
      capaciteit: number
      labels: string[]
      periode_naam: string
    }>(
      `select u.datum, u.begin_tijd, u.eind_tijd, u.omschrijving, u.prijs, u.extra_kosten,
              u.capaciteit, u.labels, p.naam as periode_naam
         from uitjes u join periodes p on p.id = u.periode_id
        where u.status = 'actief' and u.datum >= current_date - interval '7 days'
        order by u.datum limit 150`,
    )
    if (uitjes.length === 0) {
      res.json({ antwoord: "Er staan nog geen komende uitjes in het programma." })
      return
    }
    const woorden = vraag
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((woord) => woord.length > 2)
    const passend = uitjes
      .map((uitje) => ({
        uitje,
        score: woorden.filter(
          (woord) =>
            uitje.omschrijving.toLowerCase().includes(woord) ||
            (uitje.labels ?? []).join(" ").toLowerCase().includes(woord),
        ).length,
      }))
      .filter((rij) => rij.score > 0)
      .sort((a, b) => b.score - a.score || a.uitje.datum.localeCompare(b.uitje.datum))
      .slice(0, 5)
      .map((rij) => rij.uitje)
    const lijst = passend.length > 0 ? passend : uitjes.slice(0, 5)
    const regels = lijst.map((uitje) => {
      const tijdTekst = [uitje.begin_tijd?.slice(0, 5), uitje.eind_tijd?.slice(0, 5)]
        .filter(Boolean)
        .join(" – ")
      const prijs = `€ ${uitje.prijs.toFixed(2).replace(".", ",")}`
      return `• ${uitje.omschrijving} — ${datumLang(uitje.datum)}${tijdTekst ? `, ${tijdTekst}` : ""} — ${prijs}${uitje.extra_kosten ? ` (${uitje.extra_kosten})` : ""} — ${uitje.capaciteit} plekken`;
    })
    const inleiding =
      passend.length > 0
        ? "Dit vond ik in het programma:"
        : "Ik vond geen uitje dat precies past. Dit zijn de eerstvolgende uitjes:"
    res.json({ antwoord: `${inleiding}\n${regels.join("\n")}\n\nDit zijn alleen programmagegevens; ik zie geen deelnemers.` })
  }),
)

// ---------------------------------------------------------------- feedback

beheerRouter.post(
  "/feedback",
  ah(async (req, res) => {
    const tekst = veiligeTekst(req.body?.tekst)
    if (!tekst) {
      stuurFout(res, 400, "Vertel in een paar woorden wat er onduidelijk is of niet werkt.")
      return
    }
    const scherm = veiligeTekst(req.body?.scherm) || "/"
    await q(
      `insert into feedback (scherm, tekst, gebruiker_id, gebruiker_naam) values ($1,$2,$3,$4)`,
      [scherm, tekst, req.gebruiker!.id, req.gebruiker!.naam],
    )
    await logWijziging(req, {
      actie: "feedback",
      entiteit: "feedback",
      omschrijving: `${req.gebruiker!.naam} gaf feedback op ${scherm}.`,
    })
    res.status(201).json({ bericht: "Dank je wel. De beheerder ziet je melding en pakt het op." })
  }),
)

beheerRouter.get(
  "/feedback",
  vereisRecht("feedback", "zien"),
  ah(async (_req, res) => {
    const rijen = await q("select * from feedback order by created_at desc")
    res.json({ feedback: rijen })
  }),
)

beheerRouter.patch(
  "/feedback/:id",
  vereisRecht("feedback", "wijzigen"),
  ah(async (req, res) => {
    const status = veiligeTekst(req.body?.status)
    if (!["nieuw", "in_behandeling", "afgehandeld"].includes(status)) {
      stuurFout(res, 400, "Onbekende status.")
      return
    }
    const rij = await een<{ id: number; scherm: string }>("update feedback set status = $1 where id = $2 returning *", [
      status,
      Number(req.params.id),
    ])
    if (!rij) {
      stuurFout(res, 404, "Deze melding bestaat niet.")
      return
    }
    await logWijziging(req, {
      actie: "feedback-status",
      entiteit: "feedback",
      entiteitId: rij.id,
      omschrijving: `${req.gebruiker!.naam} heeft een feedbackmelding op "${status}" gezet.`,
    })
    res.json({ bericht: "Bijgewerkt." })
  }),
)
