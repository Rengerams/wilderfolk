import { Router, type Request } from "express"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { mag } from "../auth"
import { functieAan } from "../functies"
import {
  ah,
  alsGetal,
  datumLang,
  instelling,
  stuurFout,
  veiligeTekst,
} from "../util"

export const geldRouter = Router()
export const voertuigenRouter = Router()

const SOORTEN = ["drinken", "parkeren", "brandstof", "overig"]

/** Eén CSV-veld, beschermd tegen formule-uitvoering in Excel en LibreOffice. */
function csvVeld(veld: string | number): string {
  let tekst = String(veld ?? "")
  if (/^[=+\-@\t\r]/.test(tekst)) tekst = `'${tekst}`
  return `"${tekst.replaceAll('"', '""')}"`
}

function csv(velden: (string | number)[][]): string {
  return "\uFEFF" + velden.map((rij) => rij.map(csvVeld).join(";")).join("\r\n")
}

/** Wie mogen declaraties beoordelen en uitbetalen? */
const FINANCIELE_ROLLEN = ["Penningmeester", "Admin", "Beheerder"]

async function chauffeurScoped(req: Request): Promise<boolean> {
  return req.gebruiker!.rol_naam === "Chauffeur" && !mag(req.gebruiker, "declaraties", "verwijderen")
}

function vereisModule(sleutel: string, naam: string) {
  return ah(async (req, res, next) => {
    if (!(await functieAan(req.gebruiker!.id, sleutel))) {
      stuurFout(res, 403, `De functie ${naam} staat voor jou uit. De beheerder kan deze aanzetten.`)
      return
    }
    next()
  })
}

// ---------------------------------------------------------------- declaraties

geldRouter.get(
  "/",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const alleenEigen = await chauffeurScoped(req)
    const chauffeurId = Number(req.query.chauffeur_id)
    const rijen = await q(
      `select d.*, u.omschrijving as uitje_omschrijving, u.datum, u.periode_id,
              g.naam as chauffeur_naam,
              k.naam as goedgekeurd_door_naam,
              p.naam as periode_naam
         from declaraties d
         join uitjes u on u.id = d.uitje_id
         join gebruikers g on g.id = d.chauffeur_id
         join periodes p on p.id = u.periode_id
         left join gebruikers k on k.id = d.goedgekeurd_door
        where ($1::boolean = false or d.chauffeur_id = $2)
          and ($3::int = 0 or d.chauffeur_id = $3)
        order by u.datum desc, d.ingediend desc`,
      [alleenEigen, req.gebruiker!.id, chauffeurId || 0],
    )
    const chauffeurs = await q<{ id: number; naam: string }>(
      `select g.id, g.naam from gebruikers g join rollen r on r.id = g.rol_id
        where g.actief and r.naam in ('Chauffeur','Admin','Beheerder','Coördinator') order by g.naam`,
    )
    const uitjes = await q<{ id: number; omschrijving: string; datum: string; periode_naam: string }>(
      `select u.id, u.omschrijving, u.datum, p.naam as periode_naam
         from uitjes u join periodes p on p.id = u.periode_id
         left join uitje_voertuigen uv on uv.uitje_id = u.id
        where u.status = 'actief' and ($1::boolean = false or uv.chauffeur_id = $2)
          and u.datum <= current_date + interval '1 day'
        group by u.id, u.omschrijving, u.datum, p.naam
        order by u.datum desc`,
      [alleenEigen, req.gebruiker!.id],
    )
    res.json({ declaraties: rijen, chauffeurs, uitjes, soorten: SOORTEN })
  }),
)

geldRouter.post(
  "/",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const uitjeId = Number(req.body?.uitje_id)
    const bedrag = alsGetal(req.body?.bedrag, 0)
    const soort = veiligeTekst(req.body?.soort)
    if (!uitjeId || bedrag <= 0 || !SOORTEN.includes(soort)) {
      stuurFout(res, 400, "Vul een uitje, een bedrag en een soort kosten in.")
      return
    }
    const alleenEigen = await chauffeurScoped(req)
    if (alleenEigen) {
      const eigen = await een(
        "select 1 from uitje_voertuigen where uitje_id = $1 and chauffeur_id = $2",
        [uitjeId, req.gebruiker!.id],
      )
      if (!eigen) {
        stuurFout(res, 403, "Je kunt alleen kosten invoeren voor je eigen uitjes.")
        return
      }
    }
    const bon = veiligeTekst(req.body?.bon)
    const rij = await een(
      `insert into declaraties (uitje_id, chauffeur_id, bedrag, soort, omschrijving, bon)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [uitjeId, req.gebruiker!.id, bedrag, soort, veiligeTekst(req.body?.omschrijving) || null, bon || null],
    )
    await logWijziging(req, {
      actie: "declaratie",
      entiteit: "declaratie",
      entiteitId: (rij as { id: number }).id,
      nieuweWaarde: rij,
      omschrijving: `${req.gebruiker!.naam} heeft € ${bedrag.toFixed(2).replace(".", ",")} aan ${soort} gedeclareerd.`,
    })
    res.status(201).json({ declaratie: rij })
  }),
)

geldRouter.patch(
  "/:id",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const rij = await een<{ id: number; chauffeur_id: number; status: string; bedrag: number; soort: string }>(
      "select * from declaraties where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze declaratie bestaat niet.")
      return
    }
    if (rij.chauffeur_id !== req.gebruiker!.id && !mag(req.gebruiker, "declaraties", "wijzigen")) {
      stuurFout(res, 403, "Je kunt alleen je eigen declaraties aanpassen.")
      return
    }
    if (rij.status !== "ingediend") {
      stuurFout(res, 400, "Deze declaratie is al beoordeeld en kan niet meer worden aangepast.")
      return
    }
    const bedrag = alsGetal(req.body?.bedrag, rij.bedrag)
    const soort = veiligeTekst(req.body?.soort)
    if (bedrag <= 0 || !SOORTEN.includes(soort || rij.soort)) {
      stuurFout(res, 400, "Controleer het bedrag en de soort kosten.")
      return
    }
    const bijgewerkt = await een(
      `update declaraties set bedrag = $1, soort = $2, omschrijving = $3, bon = coalesce($4, bon)
        where id = $5 and status = 'ingediend' returning *`,
      [
        bedrag,
        soort || rij.soort,
        veiligeTekst(req.body?.omschrijving) || null,
        veiligeTekst(req.body?.bon) || null,
        rij.id,
      ],
    )
    await logWijziging(req, {
      actie: "declaratie-wijzigen",
      entiteit: "declaratie",
      entiteitId: rij.id,
      oudeWaarde: rij,
      nieuweWaarde: bijgewerkt,
      omschrijving: `${req.gebruiker!.naam} heeft een declaratie aangepast naar € ${bedrag.toFixed(2).replace(".", ",")}.`,
    })
    res.json({ declaratie: bijgewerkt })
  }),
)

geldRouter.post(
  "/:id/beoordelen",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const rij = await een<{ id: number; status: string; chauffeur_id: number; bedrag: number }>(
      "select * from declaraties where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze declaratie bestaat niet.")
      return
    }
    if (!FINANCIELE_ROLLEN.includes(req.gebruiker!.rol_naam)) {
      stuurFout(res, 403, "Alleen de penningmeester of een beheerder kan declaraties beoordelen.")
      return
    }
    if (rij.chauffeur_id === req.gebruiker!.id) {
      stuurFout(res, 403, "Je kunt je eigen declaratie niet beoordelen.")
      return
    }
    if (rij.status !== "ingediend") {
      stuurFout(res, 409, "Deze declaratie is al beoordeeld.")
      return
    }
    const goedkeuren = req.body?.goedkeuren === true
    const reden = veiligeTekst(req.body?.reden)
    if (!goedkeuren && !reden) {
      stuurFout(res, 400, "Geef een reden op als je de declaratie afkeurt.")
      return
    }
    // Alleen van 'ingediend' naar 'goedgekeurd' of 'afgekeurd'; een tweede
    // beoordeling (of een betaalde declaratie) kan de status niet meer wijzigen.
    const bijgewerkt = await een(
      `update declaraties set status = $1, goedgekeurd_door = $2, goedgekeurd_op = now(),
         afgekeurd_reden = $3 where id = $4 and status = 'ingediend' returning *`,
      [goedkeuren ? "goedgekeurd" : "afgekeurd", req.gebruiker!.id, goedkeuren ? null : reden, rij.id],
    )
    if (!bijgewerkt) {
      stuurFout(res, 409, "Deze declaratie is al beoordeeld.")
      return
    }
    await logWijziging(req, {
      actie: goedkeuren ? "declaratie-goedkeuren" : "declaratie-afkeuren",
      entiteit: "declaratie",
      entiteitId: rij.id,
      oudeWaarde: { status: rij.status },
      nieuweWaarde: { status: goedkeuren ? "goedgekeurd" : "afgekeurd", reden },
      omschrijving: `${req.gebruiker!.naam} heeft een declaratie van € ${rij.bedrag.toFixed(2).replace(".", ",")} ${goedkeuren ? "goedgekeurd" : `afgekeurd${reden ? `: ${reden}` : ""}`}.`,
    })
    res.json({ declaratie: bijgewerkt })
  }),
)

geldRouter.post(
  "/:id/uitbetalen",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const rij = await een<{ id: number; status: string; bedrag: number; chauffeur_id: number }>(
      "select * from declaraties where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze declaratie bestaat niet.")
      return
    }
    if (!FINANCIELE_ROLLEN.includes(req.gebruiker!.rol_naam)) {
      stuurFout(res, 403, "Alleen de penningmeester of een beheerder kan declaraties uitbetalen.")
      return
    }
    if (rij.chauffeur_id === req.gebruiker!.id) {
      stuurFout(res, 403, "Je kunt je eigen declaratie niet uitbetalen.")
      return
    }
    if (rij.status !== "goedgekeurd") {
      if (rij.status === "uitbetaald") {
        stuurFout(res, 409, "Deze declaratie is al uitbetaald.")
        return
      }
      stuurFout(res, 400, "Alleen een goedgekeurde declaratie kan worden uitbetaald.")
      return
    }
    // Conditioneel op 'goedgekeurd', zodat dubbel uitbetalen onmogelijk is.
    const bijgewerkt = await een(
      "update declaraties set status = 'uitbetaald', uitbetaald_op = now() where id = $1 and status = 'goedgekeurd' returning *",
      [rij.id],
    )
    if (!bijgewerkt) {
      stuurFout(res, 409, "Deze declaratie is al uitbetaald.")
      return
    }
    await logWijziging(req, {
      actie: "declaratie-uitbetalen",
      entiteit: "declaratie",
      entiteitId: rij.id,
      omschrijving: `${req.gebruiker!.naam} heeft een declaratie van € ${rij.bedrag.toFixed(2).replace(".", ",")} uitbetaald.`,
    })
    res.json({ declaratie: bijgewerkt })
  }),
)

geldRouter.delete(
  "/:id",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const rij = await een<{ id: number; chauffeur_id: number; status: string }>(
      "select * from declaraties where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze declaratie bestaat niet.")
      return
    }
    if (rij.chauffeur_id !== req.gebruiker!.id) {
      stuurFout(res, 403, "Je kunt alleen je eigen declaraties intrekken.")
      return
    }
    if (rij.status !== "ingediend") {
      stuurFout(res, 400, "Deze declaratie is al beoordeeld.")
      return
    }
    await q("delete from declaraties where id = $1", [rij.id])
    await logWijziging(req, {
      actie: "declaratie-intrekken",
      entiteit: "declaratie",
      entiteitId: rij.id,
      omschrijving: `${req.gebruiker!.naam} heeft een declaratie ingetrokken.`,
    })
    res.json({ bericht: "Declaratie ingetrokken." })
  }),
)

geldRouter.get(
  "/export",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const alleenEigen = await chauffeurScoped(req)
    const rijen = await q<{
      datum: string
      omschrijving: string
      chauffeur_naam: string
      bedrag: number
      soort: string
      toelichting: string | null
      status: string
    }>(
      `select u.datum, u.omschrijving, g.naam as chauffeur_naam, d.bedrag, d.soort,
              d.omschrijving as toelichting, d.status
         from declaraties d
         join uitjes u on u.id = d.uitje_id
         join gebruikers g on g.id = d.chauffeur_id
        where ($1::boolean = false or d.chauffeur_id = $2)
        order by u.datum desc`,
      [alleenEigen, req.gebruiker!.id],
    )
    const inhoud = csv([
      ["datum", "uitje", "chauffeur", "bedrag", "soort", "toelichting", "status"],
      ...rijen.map((rij) => [
        rij.datum,
        rij.omschrijving,
        rij.chauffeur_naam,
        rij.bedrag.toFixed(2).replace(".", ","),
        rij.soort,
        rij.toelichting ?? "",
        rij.status,
      ]),
    ])
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="declaraties.csv"')
    res.send(inhoud)
  }),
)

geldRouter.get(
  "/maandoverzicht",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const maand = veiligeTekst(req.query.maand) || new Date().toISOString().slice(0, 7)
    const declaraties = await q<{
      uitje: string
      datum: string
      chauffeur_naam: string
      bedrag: number
      soort: string
      status: string
    }>(
      `select u.omschrijving as uitje, u.datum, g.naam as chauffeur_naam, d.bedrag, d.soort, d.status
         from declaraties d
         join uitjes u on u.id = d.uitje_id
         join gebruikers g on g.id = d.chauffeur_id
        where to_char(u.datum, 'YYYY-MM') = $1
        order by u.datum`,
      [maand],
    )
    const kas = await q<{
      uitje: string
      datum: string
      verwacht: number
      geteld: number
      verschil: number
      geteld_door_naam: string | null
    }>(
      `select u.omschrijving as uitje, k.datum, k.verwacht, k.geteld, k.verschil, g.naam as geteld_door_naam
         from kas_afsluitingen k join uitjes u on u.id = k.uitje_id
         left join gebruikers g on g.id = k.geteld_door
        where to_char(k.datum, 'YYYY-MM') = $1 order by k.datum`,
      [maand],
    )
    const stortingen = await q<{ datum: string; bedrag: number; omschrijving: string | null }>(
      "select datum, bedrag, omschrijving from stortingen where to_char(datum, 'YYYY-MM') = $1 order by datum",
      [maand],
    )
    res.json({
      maand,
      declaraties,
      kas,
      stortingen,
      totaalDeclaraties: declaraties.reduce((som, rij) => som + rij.bedrag, 0),
      totaalContant: kas.reduce((som, rij) => som + rij.geteld, 0),
      totaalGestort: stortingen.reduce((som, rij) => som + rij.bedrag, 0),
    })
  }),
)

geldRouter.get(
  "/maandoverzicht/export",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const maand = veiligeTekst(req.query.maand) || new Date().toISOString().slice(0, 7)
    const declaraties = await q<{ uitje: string; datum: string; chauffeur_naam: string; bedrag: number; soort: string; status: string }>(
      `select u.omschrijving as uitje, u.datum, g.naam as chauffeur_naam, d.bedrag, d.soort, d.status
         from declaraties d join uitjes u on u.id = d.uitje_id join gebruikers g on g.id = d.chauffeur_id
        where to_char(u.datum, 'YYYY-MM') = $1 order by u.datum`,
      [maand],
    )
    const kas = await q<{ uitje: string; datum: string; verwacht: number; geteld: number; verschil: number }>(
      `select u.omschrijving as uitje, k.datum, k.verwacht, k.geteld, k.verschil
         from kas_afsluitingen k join uitjes u on u.id = k.uitje_id
        where to_char(k.datum, 'YYYY-MM') = $1 order by k.datum`,
      [maand],
    )
    const inhoud = csv([
      [`Maandoverzicht ${maand}`],
      [],
      ["Declaraties"],
      ["datum", "uitje", "chauffeur", "soort", "bedrag", "status"],
      ...declaraties.map((rij) => [
        rij.datum, rij.uitje, rij.chauffeur_naam, rij.soort,
        rij.bedrag.toFixed(2).replace(".", ","), rij.status,
      ]),
      [],
      ["Kas"],
      ["datum", "uitje", "verwacht", "geteld", "verschil"],
      ...kas.map((rij) => [
        rij.datum, rij.uitje,
        rij.verwacht.toFixed(2).replace(".", ","),
        rij.geteld.toFixed(2).replace(".", ","),
        rij.verschil.toFixed(2).replace(".", ","),
      ]),
    ])
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="maandoverzicht-${maand}.csv"`)
    res.send(inhoud)
  }),
)

geldRouter.get(
  "/mijn-uitjes",
  vereisModule("chauffeurskosten", "Chauffeurskosten"),
  ah(async (req, res) => {
    const uitjes = await q(
      `select u.id, u.datum, u.begin_tijd, u.eind_tijd, u.omschrijving, u.capaciteit, p.naam as periode_naam,
              v.naam as voertuig_naam, v.capaciteit as voertuig_capaciteit
         from uitje_voertuigen uv
         join uitjes u on u.id = uv.uitje_id
         join periodes p on p.id = u.periode_id
         join voertuigen v on v.id = uv.voertuig_id
        where uv.chauffeur_id = $1 and u.status = 'actief'
        order by u.datum desc`,
      [req.gebruiker!.id],
    )
    res.json({ uitjes })
  }),
)

// ---------------------------------------------------------------- kas

geldRouter.get(
  "/kas/overzicht",
  vereisModule("kas", "Kas"),
  ah(async (_req, res) => {
    const grens = Number(await instelling("kas_grens", "1000"))
    const afsluitingen = await q(
      `select k.*, u.omschrijving, g.naam as geteld_door_naam
         from kas_afsluitingen k join uitjes u on u.id = k.uitje_id
         left join gebruikers g on g.id = k.geteld_door
        order by k.datum desc limit 100`,
    )
    const stortingen = await q(
      `select s.*, g.naam as door_naam from stortingen s
         left join gebruikers g on g.id = s.door order by s.datum desc limit 100`,
    )
    const geteld = await een<{ totaal: number }>(
      "select coalesce(sum(geteld),0)::numeric as totaal from kas_afsluitingen",
    )
    const gestort = await een<{ totaal: number }>(
      "select coalesce(sum(bedrag),0)::numeric as totaal from stortingen",
    )
    const saldo = Number(geteld?.totaal ?? 0) - Number(gestort?.totaal ?? 0)
    res.json({ afsluitingen, stortingen, saldo, grens, waarschuwing: saldo > grens })
  }),
)

geldRouter.post(
  "/kas/afsluiting",
  vereisModule("kas", "Kas"),
  ah(async (req, res) => {
    const uitjeId = Number(req.body?.uitje_id)
    const verwacht = alsGetal(req.body?.verwacht, 0)
    const geteld = alsGetal(req.body?.geteld, 0)
    if (!uitjeId) {
      stuurFout(res, 400, "Kies een uitje.")
      return
    }
    if (
      !Number.isFinite(verwacht) || !Number.isFinite(geteld) ||
      verwacht < 0 || geteld < 0 || verwacht > 1_000_000 || geteld > 1_000_000
    ) {
      stuurFout(res, 400, "Vul bedragen tussen € 0,00 en € 1.000.000,00 in.")
      return
    }
    const bestaandeAfsluiting = await een<{ id: number }>(
      "select id from kas_afsluitingen where uitje_id = $1",
      [uitjeId],
    )
    if (bestaandeAfsluiting) {
      stuurFout(res, 409, "Voor dit uitje is de kas al afgesloten. Gebruik een correctie in plaats van een tweede afsluiting.")
      return
    }
    const verschil = Math.round((geteld - verwacht) * 100) / 100
    let rij: unknown
    try {
      rij = await een(
        `insert into kas_afsluitingen (uitje_id, verwacht, geteld, verschil, geteld_door, opmerking)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [uitjeId, verwacht, geteld, verschil, req.gebruiker!.id, veiligeTekst(req.body?.opmerking) || null],
      )
    } catch (fout) {
      if ((fout as { code?: string }).code === "23505") {
        stuurFout(res, 409, "Voor dit uitje is de kas al afgesloten.")
        return
      }
      throw fout
    }
    await logWijziging(req, {
      actie: "kasafsluiting",
      entiteit: "kas",
      entiteitId: (rij as { id: number }).id,
      nieuweWaarde: rij,
      omschrijving: `${req.gebruiker!.naam} heeft de kas afgesloten: € ${geteld.toFixed(2).replace(".", ",")} geteld, verschil € ${verschil.toFixed(2).replace(".", ",")}.`,
    })
    res.status(201).json({ afsluiting: rij })
  }),
)

geldRouter.post(
  "/kas/storting",
  vereisModule("kas", "Kas"),
  ah(async (req, res) => {
    const bedrag = alsGetal(req.body?.bedrag, 0)
    if (bedrag <= 0) {
      stuurFout(res, 400, "Vul een bedrag in.")
      return
    }
    const rij = await een(
      `insert into stortingen (datum, bedrag, omschrijving, door)
       values (coalesce($1::date, current_date), $2, $3, $4) returning *`,
      [veiligeTekst(req.body?.datum) || null, bedrag, veiligeTekst(req.body?.omschrijving) || null, req.gebruiker!.id],
    )
    await logWijziging(req, {
      actie: "storting",
      entiteit: "kas",
      entiteitId: (rij as { id: number }).id,
      omschrijving: `${req.gebruiker!.naam} heeft een storting van € ${bedrag.toFixed(2).replace(".", ",")} vastgelegd.`,
    })
    res.status(201).json({ storting: rij })
  }),
)

// ---------------------------------------------------------------- voertuigen

voertuigenRouter.get(
  "/",
  ah(async (_req, res) => {
    const voertuigen = await q("select * from voertuigen order by capaciteit, naam")
    res.json({ voertuigen })
  }),
)

voertuigenRouter.post(
  "/",
  ah(async (req, res) => {
    const naamVoertuig = veiligeTekst(req.body?.naam)
    const capaciteit = Math.max(1, alsGetal(req.body?.capaciteit, 0))
    const kenteken = veiligeTekst(req.body?.kenteken).toUpperCase() || null
    if (!naamVoertuig || capaciteit <= 0) {
      stuurFout(res, 400, "Vul een naam en een capaciteit in.")
      return
    }
    const rij = await een(
      "insert into voertuigen (naam, capaciteit, kenteken) values ($1,$2,$3) returning *",
      [naamVoertuig, capaciteit, kenteken],
    )
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "voertuig",
      entiteitId: (rij as { id: number }).id,
      omschrijving: `${req.gebruiker!.naam} heeft voertuig "${naamVoertuig}"${kenteken ? ` met kenteken ${kenteken}` : ""} en ${capaciteit} plekken toegevoegd.`,
    })
    res.status(201).json({ voertuig: rij })
  }),
)

voertuigenRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const rij = await een<{ id: number; naam: string; capaciteit: number; actief: boolean; kenteken: string | null }>(
      "select * from voertuigen where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Dit voertuig bestaat niet.")
      return
    }
    const bijgewerkt = await een(
      "update voertuigen set naam = $1, capaciteit = $2, actief = $3, kenteken = $4 where id = $5 returning *",
      [
        veiligeTekst(req.body?.naam) || rij.naam,
        Math.max(1, alsGetal(req.body?.capaciteit, rij.capaciteit)),
        typeof req.body?.actief === "boolean" ? req.body.actief : rij.actief,
        req.body?.kenteken !== undefined
          ? veiligeTekst(req.body.kenteken).toUpperCase() || null
          : (rij.kenteken ?? null),
        rij.id,
      ],
    )
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "voertuig",
      entiteitId: rij.id,
      oudeWaarde: rij,
      nieuweWaarde: bijgewerkt,
      omschrijving: `${req.gebruiker!.naam} heeft voertuig "${rij.naam}" gewijzigd.`,
    })
    res.json({ voertuig: bijgewerkt })
  }),
)

export function datumTekst(datum: string): string {
  return datumLang(datum)
}
