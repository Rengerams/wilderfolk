import { Router } from "express"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { mag } from "../auth"
import { ah, datumKort, datumLang, getalParam, naam, stuurFout, veiligeTekst, vandaag } from "../util"
import { reserveZin, vraagReservisten } from "../reserve"

export const opgaveRouter = Router()

type Periode = {
  id: number
  naam: string
  start_op: string
  eind_op: string
  aanmelddeadline: string
  status: string
}

type Deelnemer = {
  id: number
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  email: string | null
  mobiliteit: string[]
  status: string
  contactvoorkeur: string
}

/**
 * Alle periodes waar de gekozen uitjes bij horen. Eén opgave hoort bij precies
 * één periode; de aanroeper weigert een mix.
 */
async function haalPeriodesVanUitjes(uitjeIds: number[]): Promise<Periode[]> {
  if (uitjeIds.length === 0) return []
  return q<Periode>(
    `select distinct p.* from periodes p join uitjes u on u.periode_id = p.id
      where u.id = any($1::int[]) order by p.id`,
    [uitjeIds],
  )
}

async function haalDeelnemer(id: number): Promise<Deelnemer | undefined> {
  return een<Deelnemer>("select * from deelnemers where id = $1", [id])
}

async function groepLeden(deelnemerId: number) {
  const groep = await een<{ id: number; naam: string }>(
    `select g.id, g.naam from groepje_leden gl join groepjes g on g.id = gl.groepje_id
      where gl.deelnemer_id = $1`,
    [deelnemerId],
  )
  if (!groep) return { groep: null, leden: [] as Deelnemer[] }
  const leden = await q<Deelnemer>(
    `select d.* from groepje_leden gl join deelnemers d on d.id = gl.deelnemer_id
      where gl.groepje_id = $1 and d.id <> $2 order by d.achternaam`,
    [groep.id, deelnemerId],
  )
  return { groep, leden }
}

function periodeIsOpen(periode: Periode): boolean {
  return periode.status === "gepubliceerd" && vandaag() <= periode.aanmelddeadline
}

async function haalUitjesVanPeriode(periodeId: number) {
  return q<{
    id: number
    datum: string
    begin_tijd: string | null
    eind_tijd: string | null
    omschrijving: string
    prijs: number
    extra_kosten: string | null
    labels: string[]
    capaciteit: number
    geschiktheid: string | null
    reeks_id: number | null
    aantal_opgaven: number
  }>(
    `select u.id, u.datum, u.begin_tijd, u.eind_tijd, u.omschrijving, u.prijs, u.extra_kosten,
            u.labels, u.capaciteit, u.geschiktheid, u.reeks_id,
            (select count(*) from opgaven o where o.uitje_id = u.id)::int as aantal_opgaven
       from uitjes u
      where u.periode_id = $1 and u.status = 'actief'
      order by u.datum, u.begin_tijd nulls last, u.id`,
    [periodeId],
  )
}

opgaveRouter.get(
  "/overzicht",
  ah(async (req, res) => {
    const periodeId = getalParam(req.query.periode_id)
    if (periodeId === null) {
      stuurFout(res, 400, "Kies eerst een periode.")
      return
    }
    const periode = await een<Periode>("select * from periodes where id = $1", [periodeId])
    if (!periode) {
      stuurFout(res, 404, "Kies eerst een periode.")
      return
    }
    const uitjes = await haalUitjesVanPeriode(periode.id)
    res.json({
      periode,
      uitjes,
      open: periodeIsOpen(periode),
      vandaag: vandaag(),
    })
  }),
)

opgaveRouter.get(
  "/deelnemer/:id",
  ah(async (req, res) => {
    const deelnemer = await haalDeelnemer(Number(req.params.id))
    if (!deelnemer) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    const periodeId = getalParam(req.query.periode_id)
    if (periodeId === null) {
      stuurFout(res, 400, "Kies eerst een periode.")
      return
    }
    const periode = await een<Periode>("select * from periodes where id = $1", [periodeId])
    if (!periode) {
      stuurFout(res, 404, "Kies eerst een periode.")
      return
    }
    const uitjes = await haalUitjesVanPeriode(periode.id)
    const { groep, leden } = await groepLeden(deelnemer.id)
    const eigenOpgaven = await q<{ id: number; uitje_id: number; reeks_keuze: boolean; met_groepje: boolean; notitie: string | null }>(
      `select o.id, o.uitje_id, o.reeks_keuze, o.met_groepje, o.notitie
         from opgaven o join uitjes u on u.id = o.uitje_id
        where o.deelnemer_id = $1 and u.periode_id = $2`,
      [deelnemer.id, periode.id],
    )
    const groepsOpgaven = leden.length
      ? await q<{ deelnemer_id: number; uitje_id: number; reeks_keuze: boolean }>(
          `select o.deelnemer_id, o.uitje_id, o.reeks_keuze
             from opgaven o join uitjes u on u.id = o.uitje_id
            where o.deelnemer_id = any($1::int[]) and u.periode_id = $2`,
          [leden.map((lid) => lid.id), periode.id],
        )
      : []
    res.json({ deelnemer, periode, uitjes, groep, leden, eigenOpgaven, groepsOpgaven, open: periodeIsOpen(periode) })
  }),
)

opgaveRouter.post(
  "/",
  ah(async (req, res) => {
    const deelnemerId = Number(req.body?.deelnemer_id)
    const naarNummers = (waarde: unknown): number[] => {
      if (!Array.isArray(waarde)) return []
      const nummers = waarde.map((item) => Number(item))
      return [...new Set(nummers.filter((nummer) => Number.isFinite(nummer) && nummer > 0))]
    }
    const uitjeIds = naarNummers(req.body?.uitje_ids)
    const reeksIds = naarNummers(req.body?.reeks_ids)
    const metGroepje = req.body?.met_groepje !== false
    const notitie = veiligeTekst(req.body?.notitie) || null
    const reden = veiligeTekst(req.body?.reden)

    const deelnemer = await haalDeelnemer(deelnemerId)
    if (!deelnemer) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    if (deelnemer.status === "gestopt") {
      stuurFout(res, 400, "Deze deelnemer is gestopt. Zet de status eerst op actief.")
      return
    }
    if (uitjeIds.length === 0 && reeksIds.length === 0) {
      stuurFout(res, 400, "Kies minstens één uitje.")
      return
    }

    const alleUitjes = await q<{ id: number; datum: string; omschrijving: string; prijs: number; geschiktheid: string | null; reeks_id: number | null; periode_id: number }>(
      "select * from uitjes where id = any($1::int[]) or (reeks_id = any($2::int[])) order by datum",
      [uitjeIds.length ? uitjeIds : [-1], reeksIds.length ? reeksIds : [-1]],
    )
    // Aangeleverde ID's die niet (meer) bestaan niet stilzwijgend negeren: de
    // gebruiker zou anders een bevestiging krijgen voor minder uitjes dan gekozen.
    const gevondenUitjes = new Set(alleUitjes.map((uitje) => uitje.id))
    const ontbrekendeUitjes = uitjeIds.filter((id) => !gevondenUitjes.has(id))
    if (ontbrekendeUitjes.length > 0) {
      stuurFout(res, 400, `Deze uitjes bestaan niet (meer): ${ontbrekendeUitjes.join(", ")}. Ververs het scherm en probeer opnieuw.`)
      return
    }
    const gevondenReeksen = new Set(
      alleUitjes.map((uitje) => uitje.reeks_id).filter((id): id is number => Boolean(id)),
    )
    const ontbrekendeReeksen = reeksIds.filter((id) => !gevondenReeksen.has(id))
    if (ontbrekendeReeksen.length > 0) {
      stuurFout(res, 400, `Deze reeksen bestaan niet (meer): ${ontbrekendeReeksen.join(", ")}. Ververs het scherm en probeer opnieuw.`)
      return
    }

    const periodes = await haalPeriodesVanUitjes(alleUitjes.map((u) => u.id))
    if (periodes.length === 0) {
      stuurFout(res, 400, "Deze uitjes horen niet bij een periode.")
      return
    }
    if (periodes.length > 1) {
      stuurFout(
        res,
        400,
        "De gekozen uitjes horen bij verschillende periodes. Kies uitjes uit één periode.",
      )
      return
    }
    const periode = periodes[0]
    const magOverschrijven = mag(req.gebruiker, "indeling", "wijzigen")
    if (!periodeIsOpen(periode)) {
      if (!magOverschrijven || !reden) {
        stuurFout(
          res,
          403,
          `De opgave is gesloten op ${datumLang(periode.aanmelddeadline)}. Alleen de coördinator kan met een reden nog iets wijzigen.`,
        )
        return
      }
    }

    const { groep, leden } = await groepLeden(deelnemer.id)
    const doelgroep = new Set<number>([deelnemer.id])
    if (metGroepje) for (const lid of leden) if (lid.status !== "gestopt") doelgroep.add(lid.id)

    const toegevoegd: number[] = []
    const opgaveIds: number[] = []
    for (const uitje of alleUitjes) {
      const isReeks = Boolean(uitje.reeks_id && reeksIds.includes(uitje.reeks_id))
      if (!isReeks && !uitjeIds.includes(uitje.id)) continue
      for (const persoonId of doelgroep) {
        const opgeslagen = await een<{ id: number }>(
          `insert into opgaven (uitje_id, deelnemer_id, reeks_keuze, met_groepje, bron, notitie, aangemaakt_door)
           values ($1,$2,$3,$4,'telefoon',$5,$6)
           on conflict (uitje_id, deelnemer_id) do update
             set reeks_keuze = excluded.reeks_keuze, met_groepje = excluded.met_groepje,
                 notitie = coalesce(excluded.notitie, opgaven.notitie)
           returning id`,
          [uitje.id, persoonId, isReeks, metGroepje, persoonId === deelnemer.id ? notitie : null, req.gebruiker!.id],
        )
        if (opgeslagen) opgaveIds.push(opgeslagen.id)
        toegevoegd.push(uitje.id)
      }
    }
    // Geldt voor iedere opgave, met of zonder groepje.
    if (toegevoegd.length > 0) {
      await q("update deelnemers set eerste_opgave = coalesce(eerste_opgave, now()) where id = $1", [
        deelnemer.id,
      ])
    }

    const waarschuwingen: string[] = []
    const heeftRollator = (deelnemer.mobiliteit ?? []).some((m) =>
      m.toLowerCase().includes("rollator") || m.toLowerCase().includes("rolstoel"),
    )
    if (heeftRollator) {
      for (const uitje of alleUitjes) {
        if (uitje.geschiktheid && uitje.geschiktheid.toLowerCase().includes("rollator")) {
          waarschuwingen.push(
            `${uitje.omschrijving} op ${datumLang(uitje.datum)} is minder geschikt voor rollators of rolstoelen.`,
          )
        }
      }
    }

    const bevestiging = alleUitjes
      .map(
        (uitje) =>
          `${uitje.omschrijving} – ${datumKort(uitje.datum)} om ${""}${uitje.datum ? "" : ""}${uitje.prijs > 0 ? ` € ${uitje.prijs.toFixed(2).replace(".", ",")}` : " gratis"}`,
      )
      .join("; ")

    const groepsMelding = groep
      ? metGroepje
        ? `Ook opgegeven: groepje "${groep.naam}" (${leden.map((lid) => naam(lid)).join(", ")}).`
        : `Alleen ${naam(deelnemer)} opgegeven; groepje "${groep.naam}" is niet meegenomen.`
      : null

    await logWijziging(req, {
      actie: "opgave",
      entiteit: "deelnemer",
      entiteitId: deelnemer.id,
      nieuweWaarde: { uitje_ids: [...new Set(toegevoegd)], met_groepje: metGroepje, notitie },
      omschrijving:
        `${req.gebruiker!.naam} heeft ${naam(deelnemer)} opgegeven voor ${alleUitjes
          .map((uitje) => `${uitje.omschrijving} op ${datumLang(uitje.datum)}`)
          .join(", ")}.${groepsMelding ? ` ${groepsMelding}` : ""}${reden ? ` Reden: ${reden}.` : ""}`,
    })

    res.status(201).json({
      bevestiging: `Opgegeven voor: ${bevestiging}.`,
      groepsMelding,
      waarschuwingen,
      aantal: new Set(toegevoegd).size,
      opgave_ids: opgaveIds,
    })
  }),
)

opgaveRouter.delete(
  "/:id",
  ah(async (req, res) => {
    const opgave = await een<{
      id: number
      uitje_id: number
      deelnemer_id: number
      omschrijving: string
      datum: string
      periode_id: number
      aanmelddeadline: string
      status: string
    }>(
      `select o.id, o.uitje_id, o.deelnemer_id, u.omschrijving, u.datum, p.id as periode_id,
              p.aanmelddeadline, p.status
         from opgaven o join uitjes u on u.id = o.uitje_id join periodes p on p.id = u.periode_id
        where o.id = $1`,
      [Number(req.params.id)],
    )
    if (!opgave) {
      stuurFout(res, 404, "Deze opgave bestaat niet.")
      return
    }
    const periode = { status: opgave.status, aanmelddeadline: opgave.aanmelddeadline } as Periode
    const reden = veiligeTekst(req.body?.reden)
    if (!periodeIsOpen(periode) && (!mag(req.gebruiker, "indeling", "wijzigen") || !reden)) {
      stuurFout(res, 403, "De opgave is gesloten. Alleen de coördinator kan met een reden afmelden.")
      return
    }
    await q("delete from opgaven where id = $1", [opgave.id])

    // Is de indeling al bevestigd? Dan komt er een plek vrij en moet de eerste
    // reservist gebeld kunnen worden.
    let reservist: Awaited<ReturnType<typeof vraagReservisten>> = null
    const run = await een<{ id: number }>(
      `select id from indeling_runs where periode_id = $1 and modus = 'definitief'
        order by id desc limit 1`,
      [opgave.periode_id],
    )
    if (run) {
      const rij = await een<{ id: number; status: string }>(
        "select id, status from indeling_rijen where run_id = $1 and uitje_id = $2 and deelnemer_id = $3",
        [run.id, opgave.uitje_id, opgave.deelnemer_id],
      )
      if (rij && rij.status === "geplaatst") {
        await q("update indeling_rijen set status = 'afgemeld', gewijzigd = now() where id = $1", [rij.id])
        reservist = await vraagReservisten(opgave.uitje_id)
      }
    }

    const deelnemer = await haalDeelnemer(opgave.deelnemer_id)
    await logWijziging(req, {
      actie: "afmelden",
      entiteit: "deelnemer",
      entiteitId: opgave.deelnemer_id,
      oudeWaarde: { uitje_id: opgave.uitje_id },
      omschrijving: `${req.gebruiker!.naam} heeft ${deelnemer ? naam(deelnemer) : "een deelnemer"} afgemeld voor ${opgave.omschrijving} op ${datumLang(opgave.datum)}.${reden ? ` Reden: ${reden}.` : ""}${reserveZin(reservist)}`,
    })
    res.json({
      bericht: `De opgave is verwijderd.${reserveZin(reservist)}`,
      reservist,
    })
  }),
)
