import { Router } from "express"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { berekenIndeling } from "../allocatie"
import { ah, datumLang, getalParam, instelling, naam, stuurFout, veiligeTekst, vandaag } from "../util"

export const indelingRouter = Router()

type Periode = {
  id: number
  naam: string
  start_op: string
  eind_op: string
  aanmelddeadline: string
  status: string
}

type Run = {
  id: number
  periode_id: number
  modus: string
  seed: string
  samenvatting: string | null
  aangemaakt: string
  door: number | null
}

type Rij = {
  id: number
  run_id: number
  uitje_id: number
  deelnemer_id: number
  status: string
  systeem_status: string
  handmatig: boolean
  uitleg: string | null
  systeem_uitleg: string | null
  positie: number | null
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  mobiel: string[]
  groepje_naam: string | null
  datum: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  capaciteit: number
  reeks_id: number | null
}

async function haalPeriode(id: number): Promise<Periode | undefined> {
  return een<Periode>("select * from periodes where id = $1", [id])
}

async function nieuwsteRun(periodeId: number, modus?: string): Promise<Run | undefined> {
  if (modus) {
    return een<Run>(
      "select * from indeling_runs where periode_id = $1 and modus = $2 order by id desc limit 1",
      [periodeId, modus],
    )
  }
  return een<Run>(
    `select * from indeling_runs where periode_id = $1
      order by case when modus = 'definitief' then 0 else 1 end, id desc limit 1`,
    [periodeId],
  )
}

async function haalRijen(runId: number): Promise<Rij[]> {
  return q<Rij>(
    `select r.*, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon, d.mobiliteit as mobiel,
            g.naam as groepje_naam, u.datum, u.begin_tijd, u.eind_tijd, u.omschrijving,
            u.capaciteit, u.reeks_id
       from indeling_rijen r
       join deelnemers d on d.id = r.deelnemer_id
       join uitjes u on u.id = r.uitje_id
       left join groepje_leden gl on gl.deelnemer_id = d.id
       left join groepjes g on g.id = gl.groepje_id
      where r.run_id = $1
      order by u.datum, case when r.status = 'geplaatst' then 0 when r.status = 'reserve' then 1 else 2 end,
               r.positie nulls last, d.achternaam`,
    [runId],
  )
}

async function statistieken() {
  const maanden = Number(await instelling("terugkijk_maanden", "12"))
  return q<{
    id: number
    voornaam: string
    tussenvoegsel: string | null
    achternaam: string
    status: string
    groepje_id: number | null
    groepje_naam: string | null
    aantal_12m: number
    laatste_deelname: string | null
    totaal_deelnames: number
  }>(
    `select d.id, d.voornaam, d.tussenvoegsel, d.achternaam, d.status,
            g.id as groepje_id, g.naam as groepje_naam,
            (select count(*) from aanwezigheid a join uitjes u on u.id = a.uitje_id
               where a.deelnemer_id = d.id and a.aanwezig
                 and u.datum >= current_date - make_interval(months => $1))::int as aantal_12m,
            (select max(u.datum) from aanwezigheid a join uitjes u on u.id = a.uitje_id
               where a.deelnemer_id = d.id and a.aanwezig) as laatste_deelname,
            (select count(*) from aanwezigheid a where a.deelnemer_id = d.id and a.aanwezig)::int as totaal_deelnames
       from deelnemers d
       left join groepje_leden gl on gl.deelnemer_id = d.id
       left join groepjes g on g.id = gl.groepje_id
      where d.status <> 'gestopt'
      order by d.achternaam, d.voornaam`,
    [maanden],
  )
}

indelingRouter.get(
  "/:periodeId",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.periodeId))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const run = await nieuwsteRun(periode.id)
    const rijen = run ? await haalRijen(run.id) : []
    const runs = await q<Run>(
      "select * from indeling_runs where periode_id = $1 order by id desc",
      [periode.id],
    )
    const opgaven = await een<{ aantal: string }>(
      `select count(*)::text as aantal from opgaven o join uitjes u on u.id = o.uitje_id
        where u.periode_id = $1`,
      [periode.id],
    )
    const verschillen = rijen.filter((rij) => rij.status !== rij.systeem_status).length
    res.json({
      periode,
      run: run ?? null,
      runs,
      rijen,
      verschillen,
      aantalOpgaven: Number(opgaven?.aantal ?? 0),
      magIndelen: periode.status === "gesloten",
      vandaag: vandaag(),
    })
  }),
)

indelingRouter.post(
  "/:periodeId/bereken",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.periodeId))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    if (periode.status !== "gesloten") {
      stuurFout(
        res,
        400,
        "De indeling kan pas als de periode gesloten is. Sluit eerst de opgave; dan weet je wie zich heeft opgegeven.",
      )
      return
    }
    const uitjes = await q<{ id: number; datum: string; omschrijving: string; capaciteit: number; reeks_id: number | null }>(
      "select id, datum, omschrijving, capaciteit, reeks_id from uitjes where periode_id = $1 and status = 'actief' order by datum",
      [periode.id],
    )
    const deelnemers = (await statistieken()).filter((d) => d.status === "actief")
    const deelnemerIds = new Set(deelnemers.map((d) => d.id))
    const opgaven = await q<{ uitje_id: number; deelnemer_id: number; met_groepje: boolean; reeks_keuze: boolean }>(
      `select o.uitje_id, o.deelnemer_id, o.met_groepje, o.reeks_keuze
         from opgaven o join uitjes u on u.id = o.uitje_id
        where u.periode_id = $1`,
      [periode.id],
    )
    const groepen = await q<{ id: number; naam: string; leden: number[] }>(
      `select g.id, g.naam, array_agg(gl.deelnemer_id order by gl.deelnemer_id) as leden
         from groepjes g join groepje_leden gl on gl.groepje_id = g.id
        group by g.id, g.naam`,
    )
    const seed = `periode-${periode.id}-v${Date.now()}`.replace(/-v.*/, "")
    const resultaat = berekenIndeling({
      uitjes,
      deelnemers: deelnemers.map((d) => ({
        id: d.id,
        naam: naam(d),
        groepje_id: d.groepje_id,
        groepje_naam: d.groepje_naam,
        aantal_12m: d.aantal_12m,
        laatste_deelname: d.laatste_deelname,
        totaal_deelnames: d.totaal_deelnames,
      })),
      opgaven: opgaven.filter((o) => deelnemerIds.has(o.deelnemer_id)),
      groepen,
      seed,
    })

    const run = await een<Run>(
      `insert into indeling_runs (periode_id, modus, seed, samenvatting, door)
       values ($1,'proef',$2,$3,$4) returning *`,
      [periode.id, seed, resultaat.samenvatting, req.gebruiker!.id],
    )
    for (const rij of resultaat.rijen) {
      await q(
        `insert into indeling_rijen
          (run_id, uitje_id, deelnemer_id, status, systeem_status, uitleg, systeem_uitleg, positie)
         values ($1,$2,$3,$4,$4,$5,$5,$6)`,
        [run!.id, rij.uitje_id, rij.deelnemer_id, rij.status, rij.uitleg, rij.positie],
      )
    }

    // Handmatige keuzes uit de vorige proef bewaren als daarom is gevraagd (eis 5.8).
    let bewaard = 0
    if (req.body?.bewaar_handmatig === true) {
      const vorige = await een<Run>(
        "select * from indeling_runs where periode_id = $1 and id <> $2 order by id desc limit 1",
        [periode.id, run!.id],
      )
      if (vorige) {
        const handmatig = await q<{ uitje_id: number; deelnemer_id: number; status: string; uitleg: string | null }>(
          "select uitje_id, deelnemer_id, status, uitleg from indeling_rijen where run_id = $1 and handmatig",
          [vorige.id],
        )
        for (const keuze of handmatig) {
          const bestaand = await een<{ id: number }>(
            "select id from indeling_rijen where run_id = $1 and uitje_id = $2 and deelnemer_id = $3",
            [run!.id, keuze.uitje_id, keuze.deelnemer_id],
          )
          if (!bestaand) continue
          await q(
            "update indeling_rijen set status = $1, handmatig = true, uitleg = $2, gewijzigd = now() where id = $3",
            [keuze.status, `Eerder handmatig aangepast: ${keuze.uitleg ?? ""}`.trim(), bestaand.id],
          )
          bewaard += 1
        }
      }
    }

    await logWijziging(req, {
      actie: "indeling-berekenen",
      entiteit: "indeling",
      entiteitId: run!.id,
      omschrijving: `${req.gebruiker!.naam} heeft een voorstel berekend voor "${periode.naam}" (proefmodus, er is nog niemand bevestigd of gebeld). ${resultaat.samenvatting}${bewaard ? ` ${bewaard} handmatige keuzes zijn bewaard.` : ""}`,
    })
    res.status(201).json({ run, samenvatting: resultaat.samenvatting, rijen: await haalRijen(run!.id) })
  }),
)

indelingRouter.patch(
  "/rij/:id",
  ah(async (req, res) => {
    const rij = await een<{
      id: number
      run_id: number
      uitje_id: number
      deelnemer_id: number
      status: string
      uitleg: string | null
      positie: number | null
      modus: string
      periode_id: number
      capaciteit: number
      omschrijving: string
      datum: string
      voornaam: string
      tussenvoegsel: string | null
      achternaam: string
    }>(
      `select r.*, run.modus, run.periode_id, u.capaciteit, u.omschrijving, u.datum,
              d.voornaam, d.tussenvoegsel, d.achternaam
         from indeling_rijen r
         join indeling_runs run on run.id = r.run_id
         join uitjes u on u.id = r.uitje_id
         join deelnemers d on d.id = r.deelnemer_id
        where r.id = $1`,
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze regel bestaat niet.")
      return
    }
    if (rij.modus === "definitief") {
      stuurFout(res, 400, "Deze indeling is al bevestigd. Maak eerst een nieuwe proef om te wijzigen.")
      return
    }
    const status = veiligeTekst(req.body?.status)
    if (!["geplaatst", "reserve", "afgewezen"].includes(status)) {
      stuurFout(res, 400, "Kies: geplaatst, reserve of afgewezen.")
      return
    }
    const uitleg = veiligeTekst(req.body?.uitleg)
    const geplaatst = await een<{ aantal: string }>(
      `select count(*)::text as aantal from indeling_rijen
        where run_id = $1 and uitje_id = $2 and status = 'geplaatst' and id <> $3`,
      [rij.run_id, rij.uitje_id, rij.id],
    )
    const waarschuwing =
      status === "geplaatst" && Number(geplaatst?.aantal ?? 0) + 1 > rij.capaciteit
        ? `Let op: er staan dan ${Number(geplaatst?.aantal ?? 0) + 1} mensen op ${rij.capaciteit} plekken.`
        : null
    await q(
      `update indeling_rijen set status = $1, handmatig = true,
         uitleg = $2, gewijzigd = now() where id = $3`,
      [
        status,
        `${uitleg || "Handmatig aangepast door de coördinator."} (was: ${rij.status === "geplaatst" ? "geplaatst" : rij.status === "reserve" ? "reservelijst" : "afgewezen"})`,
        rij.id,
      ],
    )
    const deelnemer = { voornaam: rij.voornaam, tussenvoegsel: rij.tussenvoegsel, achternaam: rij.achternaam }
    await logWijziging(req, {
      actie: "indeling-handmatig",
      entiteit: "indeling",
      entiteitId: rij.run_id,
      oudeWaarde: { status: rij.status },
      nieuweWaarde: { status },
      omschrijving: `${req.gebruiker!.naam} heeft ${naam(deelnemer)} handmatig ${status === "geplaatst" ? "geplaatst" : status === "reserve" ? "op de reservelijst gezet" : "afgewezen"} voor ${rij.omschrijving} op ${datumLang(rij.datum)}${uitleg ? `. Reden: ${uitleg}` : "."}`,
    })
    res.json({ waarschuwing, rijen: await haalRijen(rij.run_id) })
  }),
)

indelingRouter.post(
  "/:periodeId/bevestig",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.periodeId))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    if (periode.status !== "gesloten") {
      stuurFout(res, 400, "Sluit eerst de periode voordat je de indeling bevestigt.")
      return
    }
    const run = await een<Run>(
      "select * from indeling_runs where id = $1 and periode_id = $2",
      [Number(req.body?.run_id), periode.id],
    )
    if (!run) {
      stuurFout(res, 404, "Bereken eerst een voorstel.")
      return
    }
    const rijen = await haalRijen(run.id)
    if (rijen.length === 0) {
      stuurFout(res, 400, "Dit voorstel is leeg.")
      return
    }
    if (req.body?.bevestig !== true) {
      stuurFout(res, 400, "Bevestig eerst de indeling. Daarna gaat de bellijst naar de medewerkers.")
      return
    }

    // Kopieer het voorstel naar een definitieve indeling.
    const definitief = await een<Run>(
      `insert into indeling_runs (periode_id, modus, seed, samenvatting, door)
       values ($1,'definitief',$2,$3,$4) returning *`,
      [
        periode.id,
        run.seed,
        `Bevestigd op ${vandaag()} op basis van voorstel ${run.id}.`,
        req.gebruiker!.id,
      ],
    )
    for (const rij of rijen) {
      await q(
        `insert into indeling_rijen
          (run_id, uitje_id, deelnemer_id, status, systeem_status, handmatig, uitleg, systeem_uitleg, positie)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          definitief!.id, rij.uitje_id, rij.deelnemer_id, rij.status, rij.systeem_status,
          rij.handmatig, rij.uitleg, rij.systeem_uitleg, rij.positie,
        ],
      )
    }

    // Bellijst en e-mails opnieuw opbouwen voor deze periode.
    await q("delete from bellijst where periode_id = $1 and type in ('plaatsing','reserve','niet_ingedeeld')", [
      periode.id,
    ])
    const contact = await q<{
      id: number
      voornaam: string
      tussenvoegsel: string | null
      achternaam: string
      telefoon: string | null
      email: string | null
      contactvoorkeur: string
    }>("select id, voornaam, tussenvoegsel, achternaam, telefoon, email, contactvoorkeur from deelnemers")

    let emails = 0
    let beltaken = 0
    for (const rij of rijen) {
      const deelnemer = contact.find((c) => c.id === rij.deelnemer_id)
      if (!deelnemer) continue
      const uitjeTekst = `${rij.omschrijving} op ${datumLang(rij.datum)}`
      let type = "plaatsing"
      let boodschap = ""
      if (rij.status === "geplaatst") {
        boodschap = `U bent ingedeeld voor ${uitjeTekst}.`
      } else if (rij.status === "reserve") {
        type = "reserve"
        boodschap = `U staat op de reservelijst voor ${uitjeTekst}${rij.positie ? ` (${rij.positie}e plek)` : ""}. We bellen u zodra er een plek vrijkomt.`
      } else {
        type = "niet_ingedeeld"
        boodschap = `Voor ${uitjeTekst} was helaas geen plek meer.`
      }

      if (deelnemer.email) {
        const onderwerp = `Uitslag indeling: ${rij.omschrijving} op ${datumLang(rij.datum)}`
        const tekst = [
          `Beste ${deelnemer.voornaam},`,
          "",
          boodschap,
          "",
          "Heeft u vragen? Bel of mail de coördinator van Stichting Diligence Almere.",
          "",
          "U ontvangt deze e-mail omdat er een e-mailadres van u bekend is bij de stichting.",
          "Wilt u geen e-mail meer ontvangen? Geef dat door aan de coördinator; dan halen we uw e-mailadres weg.",
          "",
          "Met vriendelijke groet,",
          "Stichting Diligence Almere",
        ].join("\n")
        await q(
          `insert into email_outbox (deelnemer_id, email, onderwerp, tekst) values ($1,$2,$3,$4)`,
          [deelnemer.id, deelnemer.email, onderwerp, tekst],
        )
        emails += 1
      }
      if (!deelnemer.email || deelnemer.contactvoorkeur === "telefoon" || deelnemer.contactvoorkeur === "beide") {
        await q(
          `insert into bellijst (periode_id, uitje_id, deelnemer_id, type, boodschap, telefoon)
           values ($1,$2,$3,$4,$5,$6)`,
          [periode.id, rij.uitje_id, deelnemer.id, type, boodschap, deelnemer.telefoon],
        )
        beltaken += 1
      }
    }

    const geplaatst = rijen.filter((rij) => rij.status === "geplaatst").length
    const reserve = rijen.filter((rij) => rij.status === "reserve").length
    await logWijziging(req, {
      actie: "indeling-bevestigen",
      entiteit: "indeling",
      entiteitId: definitief!.id,
      omschrijving: `${req.gebruiker!.naam} heeft de indeling voor "${periode.naam}" bevestigd: ${geplaatst} plaatsingen en ${reserve} op de reservelijst. ${emails} e-mails klaargezet en ${beltaken} beltaken aangemaakt.`,
    })
    res.json({
      bericht: `Indeling bevestigd. ${geplaatst} mensen zijn geplaatst, ${reserve} staan op de reservelijst. ${emails} e-mails verzonden en ${beltaken} mensen staan op de bellijst.`,
      run: definitief,
      emails,
      beltaken,
    })
  }),
)

indelingRouter.get(
  "/:periodeId/verschillen",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.periodeId))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const run = await nieuwsteRun(periode.id)
    if (!run) {
      res.json({ verschillen: [], samenvatting: null })
      return
    }
    const rijen = await haalRijen(run.id)
    const verschillen = rijen
      .filter((rij) => rij.status !== rij.systeem_status)
      .map((rij) => ({
        deelnemer: naam({ voornaam: rij.voornaam, tussenvoegsel: rij.tussenvoegsel, achternaam: rij.achternaam }),
        uitje: `${rij.omschrijving} op ${datumLang(rij.datum)}`,
        systeem: rij.systeem_status,
        handmatig: rij.status,
        uitlegSysteem: rij.systeem_uitleg,
        uitlegHandmatig: rij.uitleg,
      }))
    const perDeelnemer = await q<{ naam: string; aantal: number }>(
      `select trim(concat(d.voornaam, ' ', coalesce(d.tussenvoegsel || ' ', ''), d.achternaam)) as naam,
              count(*) filter (where r.status = 'geplaatst')::int as aantal
         from indeling_rijen r join deelnemers d on d.id = r.deelnemer_id
        where r.run_id = $1
        group by d.id, d.voornaam, d.tussenvoegsel, d.achternaam
        order by aantal desc, naam`,
      [run.id],
    )
    res.json({
      run,
      verschillen,
      perDeelnemer,
      samenvatting: `${verschillen.length} verschillen tussen het systeemvoorstel en de handmatige indeling.`,
    })
  }),
)

// ---------------------------------------------------------------- bellijst

export const bellijstRouter = Router()

bellijstRouter.get(
  "/",
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
    const rijen = await q(
      `select b.*, d.voornaam, d.tussenvoegsel, d.achternaam, d.contactvoorkeur,
              u.omschrijving, u.datum, u.begin_tijd,
              coalesce(b.telefoon, d.telefoon) as telefoonnummer
         from bellijst b
         join deelnemers d on d.id = b.deelnemer_id
         left join uitjes u on u.id = b.uitje_id
        where b.periode_id = $1
        order by case b.status when 'te_bellen' then 0 when 'niet_bereikt' then 1 else 2 end,
                 coalesce(u.datum, '2100-01-01'), d.achternaam`,
      [periode.id],
    )
    res.json({ periode, rijen })
  }),
)

bellijstRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const status = veiligeTekst(req.body?.status)
    if (!["te_bellen", "gebeld", "niet_bereikt"].includes(status)) {
      stuurFout(res, 400, "Onbekende status.")
      return
    }
    const rij = await een<{ id: number; periode_id: number; deelnemer_id: number; type: string }>(
      "select * from bellijst where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze beltaak bestaat niet.")
      return
    }
    await q("update bellijst set status = $1, bijgewerkt = now() where id = $2", [status, rij.id])
    const deelnemer = await een<{ voornaam: string; tussenvoegsel: string | null; achternaam: string }>(
      "select voornaam, tussenvoegsel, achternaam from deelnemers where id = $1",
      [rij.deelnemer_id],
    )
    await logWijziging(req, {
      actie: "bellijst",
      entiteit: "deelnemer",
      entiteitId: rij.deelnemer_id,
      omschrijving: `${req.gebruiker!.naam} heeft de beltaak van ${deelnemer ? naam(deelnemer) : "een deelnemer"} op "${status === "gebeld" ? "gebeld" : status === "niet_bereikt" ? "niet bereikt" : "nog te bellen"}" gezet.`,
    })
    res.json({ bericht: "Bijgewerkt." })
  }),
)

bellijstRouter.post(
  "/:id/reserve-uitkomst",
  ah(async (req, res) => {
    const uitkomst = veiligeTekst(req.body?.uitkomst)
    if (!["komt_mee", "kan_niet", "niet_bereikt"].includes(uitkomst)) {
      stuurFout(res, 400, "Kies: komt mee, kan niet of niet bereikt.")
      return
    }
    const taak = await een<{
      id: number
      periode_id: number
      uitje_id: number
      deelnemer_id: number
      type: string
    }>("select * from bellijst where id = $1", [Number(req.params.id)])
    if (!taak) {
      stuurFout(res, 404, "Deze beltaak bestaat niet.")
      return
    }
    const run = await een<Run>(
      "select * from indeling_runs where periode_id = $1 and modus = 'definitief' order by id desc limit 1",
      [taak.periode_id],
    )
    if (!run || !taak.uitje_id) {
      stuurFout(res, 400, "Er is nog geen bevestigde indeling voor deze periode.")
      return
    }
    const rij = await een<{ id: number; positie: number | null; status: string }>(
      "select id, positie, status from indeling_rijen where run_id = $1 and uitje_id = $2 and deelnemer_id = $3",
      [run.id, taak.uitje_id, taak.deelnemer_id],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze deelnemer staat niet in de bevestigde indeling.")
      return
    }
    const deelnemer = await een<{ voornaam: string; tussenvoegsel: string | null; achternaam: string }>(
      "select voornaam, tussenvoegsel, achternaam from deelnemers where id = $1",
      [taak.deelnemer_id],
    )
    const uitje = await een<{ omschrijving: string; datum: string; capaciteit: number }>(
      "select omschrijving, datum, capaciteit from uitjes where id = $1",
      [taak.uitje_id],
    )
    let waarschuwing: string | null = null
    if (uitkomst === "komt_mee") {
      const geplaatst = await een<{ aantal: string }>(
        "select count(*)::text as aantal from indeling_rijen where run_id = $1 and uitje_id = $2 and status = 'geplaatst'",
        [run.id, taak.uitje_id],
      )
      if (Number(geplaatst?.aantal ?? 0) + 1 > (uitje?.capaciteit ?? 0)) {
        waarschuwing = `Let op: de capaciteit van ${uitje?.capaciteit} plekken wordt overschreden. De coördinator beslist.`
      }
      await q(
        `update indeling_rijen set status = 'geplaatst', handmatig = true,
           uitleg = coalesce(uitleg, '') || ' Reservist bevestigd via de bellijst.',
           gewijzigd = now() where id = $1`,
        [rij.id],
      )
    } else if (uitkomst === "kan_niet") {
      await q(
        `update indeling_rijen set status = 'afgewezen', handmatig = true,
           uitleg = coalesce(uitleg, '') || ' Reservist kon niet; volgende reservist aan de beurt.',
           gewijzigd = now() where id = $1`,
        [rij.id],
      )
    }
    await q("update bellijst set status = $1, bijgewerkt = now() where id = $2", [
      uitkomst === "niet_bereikt" ? "niet_bereikt" : "gebeld",
      taak.id,
    ])
    const volgende = await een<{ id: number; deelnemer_id: number; voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null; positie: number | null }>(
      `select b.id, b.deelnemer_id, d.voornaam, d.tussenvoegsel, d.achternaam, coalesce(b.telefoon, d.telefoon) as telefoon,
              r.positie
         from bellijst b join deelnemers d on d.id = b.deelnemer_id
         join indeling_rijen r on r.run_id = $1 and r.uitje_id = b.uitje_id and r.deelnemer_id = b.deelnemer_id
        where b.periode_id = $2 and b.uitje_id = $3 and b.type = 'reserve' and b.status = 'te_bellen'
          and r.status = 'reserve'
        order by r.positie nulls last, d.achternaam limit 1`,
      [run.id, taak.periode_id, taak.uitje_id],
    )
    await logWijziging(req, {
      actie: "reserve-uitkomst",
      entiteit: "deelnemer",
      entiteitId: taak.deelnemer_id,
      omschrijving: `${req.gebruiker!.naam} belde ${deelnemer ? naam(deelnemer) : "een reservist"} over ${uitje?.omschrijving} op ${datumLang(uitje?.datum)}: ${
        uitkomst === "komt_mee" ? "komt mee" : uitkomst === "kan_niet" ? "kan niet" : "niet bereikt"
      }.`,
    })
    res.json({
      bericht:
        uitkomst === "komt_mee"
          ? "De reservist is geplaatst. Vergeet niet de deelnemerslijst opnieuw te printen."
          : uitkomst === "kan_niet"
            ? "Genoteerd. De volgende reservist staat nu bovenaan."
            : "Genoteerd als niet bereikt.",
      waarschuwing,
      volgende,
    })
  }),
)
