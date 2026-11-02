import { Router } from "express"
import * as XLSX from "xlsx"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { reserveZin, vraagReservisten } from "../reserve"
import {
  ah,
  alsGetal,
  datumKort,
  datumLang,
  instelling,
  stuurFout,
  veiligeTekst,
} from "../util"

export const programmaRouter = Router()

const MAANDEN: Record<string, number> = {
  januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5,
  juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11,
  jan: 0, feb: 1, mrt: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
}
const LABELS = ["Nieuw", "Op herhaling", "Op veler verzoek", "Eenmalig", "Uitgelicht"]

type Periode = {
  id: number
  naam: string
  start_op: string
  eind_op: string
  aanmelddeadline: string
  status: string
  standaard_capaciteit: number
}

type Uitje = {
  id: number
  periode_id: number
  reeks_id: number | null
  datum: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  prijs: number
  extra_kosten: string | null
  labels: string[]
  capaciteit: number
  geschiktheid: string | null
  status: string
  bron: string
  afgerond_op: string | null
  opgaven?: number
  geplaatst?: number
}

function datumNaarIso(jaar: number, maand: number, dag: number): string {
  return `${jaar}-${String(maand + 1).padStart(2, "0")}-${String(dag).padStart(2, "0")}`
}

function datumValtInPeriode(datum: string, periode: Periode): boolean {
  return datum >= periode.start_op.slice(0, 10) && datum <= periode.eind_op.slice(0, 10)
}

async function haalPeriode(id: number): Promise<Periode | undefined> {
  return een<Periode>("select * from periodes where id = $1", [id])
}

async function haalUitjes(periodeId: number): Promise<Uitje[]> {
  return q<Uitje>(
    `select u.*,
       (select count(*) from opgaven o where o.uitje_id = u.id)::int as opgaven,
       (select count(*) from indeling_rijen r
          join indeling_runs run on run.id = r.run_id
         where r.uitje_id = u.id and r.status = 'geplaatst'
           and run.id = (select max(id) from indeling_runs where periode_id = u.periode_id and modus = 'definitief'))::int as geplaatst
     from uitjes u where u.periode_id = $1
     order by u.datum, u.begin_tijd nulls last, u.id`,
    [periodeId],
  )
}

function duurTekst(begin: string | null, eind: string | null): string {
  return [begin?.slice(0, 5), eind?.slice(0, 5)].filter(Boolean).join(" - ")
}

/**
 * Kiest voertuigen die samen bij de capaciteit passen.
 * Eerst zo groot mogelijk zonder te ruim te nemen, zodat 14 twee busjes wordt en
 * niet één touringcar. Wat daarna overblijft, vult het kleinste vrije voertuig aan.
 */
async function koppelVoertuigenAutomatisch(uitjeId: number, capaciteit: number) {
  const voertuigen = await q<{ id: number; capaciteit: number }>(
    "select id, capaciteit from voertuigen where actief order by capaciteit desc, id",
  )
  const gekozen: number[] = []
  let rest = capaciteit
  for (const voertuig of voertuigen) {
    if (rest <= 0) break
    if (voertuig.capaciteit <= rest) {
      gekozen.push(voertuig.id)
      rest -= voertuig.capaciteit
    }
  }
  if (rest > 0) {
    const aanvulling = voertuigen
      .filter((voertuig) => !gekozen.includes(voertuig.id))
      .sort((a, b) => a.capaciteit - b.capaciteit)[0]
    if (aanvulling) gekozen.push(aanvulling.id)
  }
  for (const voertuigId of gekozen) {
    await q(
      "insert into uitje_voertuigen (uitje_id, voertuig_id) values ($1,$2) on conflict do nothing",
      [uitjeId, voertuigId],
    )
  }
}

programmaRouter.get(
  "/",
  ah(async (_req, res) => {
    const periodes = await q(
      `select p.*,
         (select count(*) from uitjes u where u.periode_id = p.id)::int as aantal_uitjes,
         (select count(*) from opgaven o join uitjes u on u.id = o.uitje_id where u.periode_id = p.id)::int as aantal_opgaven
       from periodes p order by p.start_op desc`,
    )
    res.json({ periodes })
  }),
)

programmaRouter.post(
  "/",
  ah(async (req, res) => {
    const periodeNaam = veiligeTekst(req.body?.naam)
    const start = veiligeTekst(req.body?.start_op)
    const eind = veiligeTekst(req.body?.eind_op)
    const deadline = veiligeTekst(req.body?.aanmelddeadline)
    if (!start || !eind || !deadline) {
      stuurFout(res, 400, "Vul de begin- en einddatum en de aanmelddeadline in.")
      return
    }
    if (eind < start) {
      stuurFout(res, 400, "De einddatum ligt voor de begindatum.")
      return
    }
    const standaard = await instelling("standaard_capaciteit", "14")
    const rij = await een<Periode>(
      `insert into periodes (naam, start_op, eind_op, aanmelddeadline, status, standaard_capaciteit)
       values ($1,$2,$3,$4,'concept',$5) returning *`,
      [periodeNaam || `${datumLang(start)} tot ${datumLang(eind)}`, start, eind, deadline, Number(standaard)],
    )
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "periode",
      entiteitId: rij!.id,
      nieuweWaarde: rij,
      omschrijving: `${req.gebruiker!.naam} heeft periode "${rij!.naam}" aangemaakt.`,
    })
    res.status(201).json({ periode: rij })
  }),
)

programmaRouter.get(
  "/:id",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const uitjes = await haalUitjes(periode.id)
    const reeksen = await q("select * from reeksen where periode_id = $1 order by omschrijving", [periode.id])
    const indeling = await een<{ id: number }>(
      "select id from indeling_runs where periode_id = $1 and modus = 'definitief' order by id desc limit 1",
      [periode.id],
    )
    res.json({ periode, uitjes, reeksen, heeftDefinitieveIndeling: Boolean(indeling) })
  }),
)

programmaRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const status = veiligeTekst(req.body?.status)
    if (status && !["concept", "gepubliceerd", "gesloten"].includes(status)) {
      stuurFout(res, 400, "Onbekende status.")
      return
    }
    if (status === "gepubliceerd") {
      const aantal = await een<{ aantal: string }>(
        "select count(*)::text as aantal from uitjes where periode_id = $1 and status = 'actief'",
        [periode.id],
      )
      if (Number(aantal?.aantal ?? 0) === 0) {
        stuurFout(res, 400, "Voeg eerst minstens één uitje toe voordat je de opgave opent.")
        return
      }
    }
    const nieuwe = {
      naam: veiligeTekst(req.body?.naam) || periode.naam,
      start_op: veiligeTekst(req.body?.start_op) || periode.start_op,
      eind_op: veiligeTekst(req.body?.eind_op) || periode.eind_op,
      aanmelddeadline: veiligeTekst(req.body?.aanmelddeadline) || periode.aanmelddeadline,
      status: status || periode.status,
      standaard_capaciteit: alsGetal(req.body?.standaard_capaciteit, periode.standaard_capaciteit),
    }
    const rij = await een<Periode>(
      `update periodes set naam=$1, start_op=$2, eind_op=$3, aanmelddeadline=$4, status=$5,
         standaard_capaciteit=$6 where id=$7 returning *`,
      [nieuwe.naam, nieuwe.start_op, nieuwe.eind_op, nieuwe.aanmelddeadline, nieuwe.status, nieuwe.standaard_capaciteit, periode.id],
    )
    const statusTekst =
      nieuwe.status === "gepubliceerd" && periode.status !== "gepubliceerd"
        ? "De opgave is geopend."
        : nieuwe.status === "gesloten" && periode.status !== "gesloten"
          ? "De periode is gesloten; de indeling kan nu worden gemaakt."
          : ""
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "periode",
      entiteitId: periode.id,
      oudeWaarde: periode,
      nieuweWaarde: nieuwe,
      omschrijving: `${req.gebruiker!.naam} heeft periode "${nieuwe.naam}" gewijzigd. ${statusTekst}`.trim(),
    })
    res.json({ periode: rij })
  }),
)

programmaRouter.post(
  "/:id/uitjes",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const omschrijving = veiligeTekst(req.body?.omschrijving)
    const datums: string[] = Array.isArray(req.body?.datums)
      ? req.body.datums.map((d: unknown) => String(d).slice(0, 10)).filter(Boolean)
      : [veiligeTekst(req.body?.datum)].filter(Boolean)
    if (!omschrijving || datums.length === 0) {
      stuurFout(res, 400, "Vul een omschrijving en minstens één datum in.")
      return
    }
    const capaciteit = Math.max(1, alsGetal(req.body?.capaciteit, periode.standaard_capaciteit))
    const prijs = Math.max(0, alsGetal(req.body?.prijs, 0))
    const begin = veiligeTekst(req.body?.begin_tijd) || null
    const eind = veiligeTekst(req.body?.eind_tijd) || null
    const labels = Array.isArray(req.body?.labels)
      ? req.body.labels.map((l: unknown) => String(l)).filter((l: string) => LABELS.includes(l))
      : []
    let reeksId: number | null = null
    if (datums.length > 1) {
      const reeks = await een<{ id: number }>(
        "insert into reeksen (periode_id, omschrijving) values ($1,$2) returning id",
        [periode.id, omschrijving],
      )
      reeksId = reeks!.id
    }
    const gemaakt: Uitje[] = []
    for (const datum of datums.sort()) {
      const rij = await een<Uitje>(
        `insert into uitjes
          (periode_id, reeks_id, datum, begin_tijd, eind_tijd, omschrijving, prijs, extra_kosten,
           labels, capaciteit, geschiktheid, bron)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'handmatig') returning *`,
        [
          periode.id, reeksId, datum, begin, eind, omschrijving, prijs,
          veiligeTekst(req.body?.extra_kosten) || null, labels, capaciteit,
          veiligeTekst(req.body?.geschiktheid) || null,
        ],
      )
      await koppelVoertuigenAutomatisch(rij!.id, capaciteit)
      gemaakt.push(rij!)
    }
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "uitje",
      entiteitId: gemaakt[0].id,
      nieuweWaarde: gemaakt,
      omschrijving: `${req.gebruiker!.naam} heeft ${gemaakt.length === 1 ? "uitje" : "reeks"} "${omschrijving}" toegevoegd${gemaakt.length > 1 ? ` op ${gemaakt.length} data` : ` op ${datumLang(gemaakt[0].datum)}`}.`,
    })
    res.status(201).json({ uitjes: gemaakt })
  }),
)

programmaRouter.post(
  "/:id/kopieer-vorige",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const vorige = await een<Periode>(
      "select * from periodes where start_op < $1 order by start_op desc limit 1",
      [periode.start_op],
    )
    if (!vorige) {
      stuurFout(res, 404, "Er is geen vorige periode gevonden.")
      return
    }
    const bron = await q<Uitje>("select * from uitjes where periode_id = $1 order by datum", [vorige.id])
    const verschilDagen = Math.round(
      (Date.parse(`${periode.start_op}T12:00:00`) - Date.parse(`${vorige.start_op}T12:00:00`)) /
        86_400_000,
    )
    const reeksMap = new Map<number, number>()
    let gekopieerd = 0
    let overgeslagen = 0
    for (const uitje of bron) {
      const nieuweDatum = new Date(Date.parse(`${uitje.datum.slice(0, 10)}T12:00:00`))
      nieuweDatum.setDate(nieuweDatum.getDate() + verschilDagen)
      const datum = nieuweDatum.toISOString().slice(0, 10)
      if (!datumValtInPeriode(datum, periode)) {
        overgeslagen += 1
        continue
      }
      let reeksId: number | null = null
      if (uitje.reeks_id) {
        if (!reeksMap.has(uitje.reeks_id)) {
          const reeks = await een<{ id: number }>(
            "insert into reeksen (periode_id, omschrijving) values ($1,$2) returning id",
            [periode.id, uitje.omschrijving],
          )
          reeksMap.set(uitje.reeks_id, reeks!.id)
        }
        reeksId = reeksMap.get(uitje.reeks_id)!
      }
      const rij = await een<{ id: number }>(
        `insert into uitjes
          (periode_id, reeks_id, datum, begin_tijd, eind_tijd, omschrijving, prijs, extra_kosten,
           labels, capaciteit, geschiktheid, bron)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'gekopieerd') returning id`,
        [
          periode.id, reeksId, datum, uitje.begin_tijd, uitje.eind_tijd, uitje.omschrijving,
          uitje.prijs, uitje.extra_kosten, uitje.labels, uitje.capaciteit, uitje.geschiktheid,
        ],
      )
      await koppelVoertuigenAutomatisch(rij!.id, uitje.capaciteit)
      gekopieerd += 1
    }
    await logWijziging(req, {
      actie: "kopiëren",
      entiteit: "periode",
      entiteitId: periode.id,
      omschrijving: `${req.gebruiker!.naam} heeft ${gekopieerd} uitjes uit "${vorige.naam}" gekopieerd naar "${periode.naam}"${overgeslagen ? `; ${overgeslagen} vielen buiten de periode` : ""}.`,
    })
    res.json({ gekopieerd, overgeslagen, uitjes: await haalUitjes(periode.id) })
  }),
)

// ---------------------------------------------------------------- import

type ImportRij = {
  rij: number
  datum: string
  dagsleutel: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  prijs: number
  extra_kosten: string | null
  capaciteit: number
  labels: string[]
  fouten: string[]
  waarschuwingen: string[]
  reeks_sleutel: string | null
}

const MAAND_WOORD = /^(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec)(\s+(\d{4}))?$/i
const DAG_WOORD = /^(ma|di|wo|do|vr|za|zo)\s*(\d{1,2})$/i

function parseTijd(tekst: string): { begin: string | null; eind: string | null } {
  const match = tekst.match(/(\d{1,2})[.:](\d{2})\s*(?:-|–|tot)\s*(\d{1,2})[.:](\d{2})/)
  if (!match) return { begin: null, eind: null }
  const maak = (uur: string, minuut: string) =>
    `${String(Number(uur)).padStart(2, "0")}:${minuut}`
  return { begin: maak(match[1], match[2]), eind: maak(match[3], match[4]) }
}

function parsePrijs(tekst: string): number | null {
  const match = tekst.match(/€?\s*(\d{1,3}(?:[.,]\d{2})|\d+)(?:\s*euro)?/i)
  if (!match) return null
  return Number.parseFloat(match[1].replace(",", "."))
}

function normaliseerOmschrijving(tekst: string): string {
  return tekst.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function leesRijen(bestand: unknown, _bestandsnaam: string): unknown[][] {
  const ruw = Buffer.isBuffer(bestand) ? bestand : Buffer.from(String(bestand), "base64")
  const werkboek = XLSX.read(ruw, { type: "buffer", cellDates: false })
  const eersteBlad = werkboek.SheetNames[0]
  if (!eersteBlad) throw new Error("Het bestand bevat geen werkblad.")
  const blad = werkboek.Sheets[eersteBlad]
  return XLSX.utils.sheet_to_json<unknown[]>(blad, { header: 1, raw: false, defval: "" }) as unknown[][]
}

function parseProgramma(rijen: unknown[][], periode: Periode, standaardCapaciteit: number) {
  let jaar = Number(periode.start_op.slice(0, 4))
  let maand: number | null = null
  let kopKolommen: Record<string, number> | null = null
  const resultaat: ImportRij[] = []

  rijen.forEach((ruweRij, index) => {
    const cellen = (ruweRij as unknown[]).map((cel) => String(cel ?? "").trim())
    if (cellen.every((cel) => !cel)) return
    const nietLeeg = cellen.filter(Boolean)

    // Maandkop, bijvoorbeeld "NOVEMBER" of "NOVEMBER 2026".
    for (const cel of nietLeeg) {
      const maandMatch = cel.match(MAAND_WOORD)
      if (maandMatch) {
        maand = MAANDEN[maandMatch[1].toLowerCase()]
        if (maandMatch[3]) jaar = Number(maandMatch[3])
        return
      }
    }

    // Kopregel met kolomnamen.
    const samen = nietLeeg.join(" ").toLowerCase()
    if (
      samen.includes("omschrijving") || samen.includes("dag") ||
      samen.includes("tijd") || samen.includes("prijs")
    ) {
      const kolommen: Record<string, number> = {}
      cellen.forEach((cel, kolomIndex) => {
        const naamCel = cel.toLowerCase()
        if (naamCel.includes("dag") || naamCel.includes("datum")) kolommen.dag = kolomIndex
        if (naamCel.includes("tijd")) kolommen.tijd = kolomIndex
        if (naamCel.includes("omschrijving") || naamCel.includes("activiteit")) kolommen.omschrijving = kolomIndex
        if (naamCel.includes("prijs") || naamCel.includes("bedrag")) kolommen.prijs = kolomIndex
        if (naamCel.includes("extra")) kolommen.extra = kolomIndex
        if (naamCel.includes("capaciteit") || naamCel.includes("plekken")) kolommen.capaciteit = kolomIndex
      })
      if (Object.keys(kolommen).length >= 2) kopKolommen = kolommen
      return
    }

    // Datum bepalen: "ma 02", "02-11", "2026-11-02" of een los dagnummer.
    let dag: number | null = null
    let maandVanRij = maand
    for (const cel of nietLeeg) {
      const dagWoord = cel.match(DAG_WOORD)
      if (dagWoord) {
        dag = Number(dagWoord[2])
        break
      }
      const iso = cel.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (iso) {
        jaar = Number(iso[1])
        maandVanRij = Number(iso[2]) - 1
        dag = Number(iso[3])
        break
      }
      const kortDatum = cel.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?$/)
      if (kortDatum) {
        dag = Number(kortDatum[1])
        maandVanRij = Number(kortDatum[2]) - 1
        if (kortDatum[3]) jaar = Number(kortDatum[3])
        break
      }
    }
    if (dag === null && maandVanRij !== null) {
      const losNummer = nietLeeg.find((cel) => /^\d{1,2}$/.test(cel))
      if (losNummer) dag = Number(losNummer)
    }
    if (dag === null || maandVanRij === null) return

    const tijdCel = cellen.find((cel) => parseTijd(cel).begin) ?? ""
    const tijden = parseTijd(tijdCel)
    const omschrijvingCel =
      (kopKolommen?.omschrijving !== undefined ? cellen[kopKolommen.omschrijving] : "") ||
      nietLeeg.find(
        (cel) =>
          /[a-z]{3,}/i.test(cel) &&
          !LABELS.includes(cel) &&
          !parseTijd(cel).begin &&
          !/^(ma|di|wo|do|vr|za|zo)\b/i.test(cel) &&
          !/^(dag|tijd|omschrijving|prijs|datum|capaciteit)/i.test(cel) &&
          !cel.startsWith("€"),
      ) ||
      ""
    const prijsCel =
      (kopKolommen?.prijs !== undefined ? cellen[kopKolommen.prijs] : "") ||
      nietLeeg.find((cel) => /€\s*\d/.test(cel)) ||
      ""
    const prijs = parsePrijs(prijsCel) ?? 0
    const capaciteitCel = kopKolommen?.capaciteit !== undefined ? cellen[kopKolommen.capaciteit] : ""
    const capaciteit = capaciteitCel && /^\d+$/.test(capaciteitCel)
      ? Number(capaciteitCel)
      : standaardCapaciteit
    const labels = nietLeeg.filter((cel) => LABELS.includes(cel))
    const extra = kopKolommen?.extra !== undefined ? cellen[kopKolommen.extra] : ""

    const fouten: string[] = []
    const waarschuwingen: string[] = []
    if (!omschrijvingCel) fouten.push("Geen omschrijving gevonden.")
    if (!tijden.begin) fouten.push("Geen tijd gevonden (bijvoorbeeld 10:30-14:30).")
    if (!prijsCel) waarschuwingen.push("Geen prijs gevonden; de prijs staat op € 0,00.")

    // Jaarwissel: een december-uitje in een periode die in november begint.
    const beginMaand = Number(periode.start_op.slice(5, 7)) - 1
    let jaarVanRij = jaar
    if (maandVanRij < beginMaand - 6) jaarVanRij += 1
    const datum = datumNaarIso(jaarVanRij, maandVanRij, dag)
    if (!datumValtInPeriode(datum, periode)) {
      fouten.push(`De datum ${datumLang(datum)} valt buiten de periode.`)
    }

    resultaat.push({
      rij: index + 1,
      datum,
      dagsleutel: datumKort(datum),
      begin_tijd: tijden.begin,
      eind_tijd: tijden.eind,
      omschrijving: omschrijvingCel,
      prijs,
      extra_kosten: extra || null,
      capaciteit,
      labels,
      fouten,
      waarschuwingen,
      reeks_sleutel: normaliseerOmschrijving(omschrijvingCel),
    })
  })

  // Zelfde of bijna dezelfde omschrijving voorstellen als reeks (eis 3.14).
  const perOmschrijving = new Map<string, number>()
  for (const rij of resultaat) {
    if (rij.reeks_sleutel) perOmschrijving.set(rij.reeks_sleutel, (perOmschrijving.get(rij.reeks_sleutel) ?? 0) + 1)
  }
  for (const rij of resultaat) {
    if (rij.reeks_sleutel && (perOmschrijving.get(rij.reeks_sleutel) ?? 0) < 2) {
      rij.reeks_sleutel = null
    }
  }
  return resultaat
}

programmaRouter.post(
  "/:id/import",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    if (!req.body?.bestand) {
      stuurFout(res, 400, "Kies eerst een Excel- of CSV-bestand.")
      return
    }
    let rijen: unknown[][]
    try {
      rijen = leesRijen(req.body.bestand, String(req.body?.bestandsnaam ?? "programma.xlsx"))
    } catch {
      stuurFout(res, 400, "Het bestand kon niet worden gelezen. Gebruik een Excel- of CSV-bestand.")
      return
    }
    let standaardCapaciteit = periode.standaard_capaciteit
    if (req.body?.standaard_capaciteit) {
      standaardCapaciteit = Math.max(1, alsGetal(req.body.standaard_capaciteit, standaardCapaciteit))
    }
    const regels = parseProgramma(rijen, periode, standaardCapaciteit)
    if (regels.length === 0) {
      stuurFout(res, 400, "Er zijn geen uitjes herkend. Controleer of de maandkop en de dagen in het bestand staan.")
      return
    }
    res.json({
      regels,
      aantal: regels.length,
      fouten: regels.filter((r) => r.fouten.length > 0).length,
      reeksen: [...new Set(regels.map((r) => r.reeks_sleutel).filter(Boolean))].length,
      standaard_capaciteit: standaardCapaciteit,
    })
  }),
)

programmaRouter.post(
  "/:id/import/bevestig",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const regels = Array.isArray(req.body?.regels) ? (req.body.regels as ImportRij[]) : []
    const geldig = regels.filter((rij) => (rij.fouten ?? []).length === 0 && rij.omschrijving)
    if (geldig.length === 0) {
      stuurFout(res, 400, "Er zijn geen regels zonder fouten om op te slaan.")
      return
    }
    const batch = await een<{ id: number }>(
      "insert into import_batches (periode_id, soort, aantal, details) values ($1,'programma',$2,$3) returning id",
      [periode.id, geldig.length, JSON.stringify({ rijen: geldig })],
    )
    const reeksMap = new Map<string, number>()
    for (const rij of geldig) {
      let reeksId: number | null = null
      if (rij.reeks_sleutel) {
        if (!reeksMap.has(rij.reeks_sleutel)) {
          const reeks = await een<{ id: number }>(
            "insert into reeksen (periode_id, omschrijving) values ($1,$2) returning id",
            [periode.id, rij.omschrijving],
          )
          reeksMap.set(rij.reeks_sleutel, reeks!.id)
        }
        reeksId = reeksMap.get(rij.reeks_sleutel)!
      }
      const uitje = await een<{ id: number }>(
        `insert into uitjes
          (periode_id, reeks_id, datum, begin_tijd, eind_tijd, omschrijving, prijs, extra_kosten,
           labels, capaciteit, bron)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'import') returning id`,
        [
          periode.id, reeksId, rij.datum, rij.begin_tijd, rij.eind_tijd, rij.omschrijving,
          rij.prijs, rij.extra_kosten, rij.labels ?? [], rij.capaciteit,
        ],
      )
      await koppelVoertuigenAutomatisch(uitje!.id, rij.capaciteit)
      await q("insert into import_batch_uitjes (batch_id, uitje_id) values ($1,$2)", [
        batch!.id,
        uitje!.id,
      ])
    }
    await logWijziging(req, {
      actie: "importeren",
      entiteit: "periode",
      entiteitId: periode.id,
      omschrijving: `${req.gebruiker!.naam} heeft ${geldig.length} uitjes uit Excel/CSV ingeladen in "${periode.naam}". De import is in één keer ongedaan te maken.`,
    })
    res.status(201).json({ batch_id: batch!.id, aantal: geldig.length, uitjes: await haalUitjes(periode.id) })
  }),
)

programmaRouter.post(
  "/import/:batchId/ongedaan",
  ah(async (req, res) => {
    const batchId = Number(req.params.batchId)
    const batch = await een<{ id: number; periode_id: number; aantal: number }>(
      "select * from import_batches where id = $1",
      [batchId],
    )
    if (!batch) {
      stuurFout(res, 404, "Deze import bestaat niet.")
      return
    }
    const uitjes = await q<{ uitje_id: number }>(
      "select uitje_id from import_batch_uitjes where batch_id = $1",
      [batchId],
    )
    for (const { uitje_id } of uitjes) {
      await q("delete from uitjes where id = $1", [uitje_id])
    }
    await q("delete from import_batches where id = $1", [batchId])
    await logWijziging(req, {
      actie: "import-ongedaan",
      entiteit: "periode",
      entiteitId: batch.periode_id,
      omschrijving: `${req.gebruiker!.naam} heeft de import van ${batch.aantal} uitjes ongedaan gemaakt.`,
    })
    res.json({ bericht: `${uitjes.length} uitjes verwijderd.` })
  }),
)

programmaRouter.get(
  "/:id/sjabloon",
  ah(async (_req, res) => {
    const rijen = [
      ["MAAND", "DAG", "TIJD", "OMSCHRIJVING", "PRIJS", "EXTRA KOSTEN", "CAPACITEIT", "LABELS"],
      ["NOVEMBER", "ma 02", "10:30-14:30", "Pannenkoekhuis De Smickel", "€ 12,50", "Lunch", "14", "Op herhaling"],
      ["", "wo 04", "09:00-18:00", "Efteling", "€ 42,00", "", "40", "Uitgelicht"],
    ]
    const blad = XLSX.utils.aoa_to_sheet(rijen)
    const werkboek = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(werkboek, blad, "Programma")
    const buffer = XLSX.write(werkboek, { type: "buffer", bookType: "xlsx" }) as Buffer
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", 'attachment; filename="sjabloon-programma.xlsx"')
    res.send(buffer)
  }),
)

programmaRouter.get(
  "/:id/export",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const uitjes = await haalUitjes(periode.id)
    const rijen = [
      [periode.naam],
      ["DATUM", "DAG", "TIJD", "OMSCHRIJVING", "PRIJS", "EXTRA KOSTEN", "CAPACITEIT", "LABELS"],
      ...uitjes.map((uitje) => [
        uitje.datum,
        datumKort(uitje.datum),
        duurTekst(uitje.begin_tijd, uitje.eind_tijd),
        uitje.omschrijving,
        `€ ${uitje.prijs.toFixed(2).replace(".", ",")}`,
        uitje.extra_kosten ?? "",
        String(uitje.capaciteit),
        (uitje.labels ?? []).join(", "),
      ]),
    ]
    const blad = XLSX.utils.aoa_to_sheet(rijen)
    const werkboek = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(werkboek, blad, "Programma")
    const buffer = XLSX.write(werkboek, { type: "buffer", bookType: "xlsx" }) as Buffer
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", `attachment; filename="programma-${periode.id}.xlsx"`)
    res.send(buffer)
  }),
)

// ---------------------------------------------------------------- uitjes

async function haalUitje(id: number): Promise<(Uitje & { periode: Periode }) | undefined> {
  const uitje = await een<Uitje>("select * from uitjes where id = $1", [id])
  if (!uitje) return undefined
  const periode = await haalPeriode(uitje.periode_id)
  return { ...uitje, periode: periode! }
}

programmaRouter.get(
  "/uitje/:id",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    const voertuigen = await q(
      `select uv.id, uv.voertuig_id, v.naam, v.capaciteit, uv.chauffeur_id, g.naam as chauffeur_naam
         from uitje_voertuigen uv
         join voertuigen v on v.id = uv.voertuig_id
         left join gebruikers g on g.id = uv.chauffeur_id
        where uv.uitje_id = $1 order by v.capaciteit`,
      [uitje.id],
    )
    const allesVoertuigen = await q("select * from voertuigen where actief order by capaciteit")
    const chauffeurs = await q(
      `select g.id, g.naam from gebruikers g join rollen r on r.id = g.rol_id
        where g.actief and (r.naam in ('Chauffeur','Admin','Beheerder') or r.naam = 'Coördinator')
        order by g.naam`,
    )
    const medewerkers = await q("select id, naam from gebruikers where actief order by naam")
    res.json({ uitje, voertuigen, alleVoertuigen: allesVoertuigen, chauffeurs, medewerkers })
  }),
)

programmaRouter.patch(
  "/uitje/:id",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    const nieuw = {
      datum: veiligeTekst(req.body?.datum) || uitje.datum,
      begin_tijd: veiligeTekst(req.body?.begin_tijd) || uitje.begin_tijd,
      eind_tijd: veiligeTekst(req.body?.eind_tijd) || uitje.eind_tijd,
      omschrijving: veiligeTekst(req.body?.omschrijving) || uitje.omschrijving,
      prijs: alsGetal(req.body?.prijs, uitje.prijs),
      extra_kosten: veiligeTekst(req.body?.extra_kosten) || null,
      labels: Array.isArray(req.body?.labels)
        ? req.body.labels.map((l: unknown) => String(l)).filter((l: string) => LABELS.includes(l))
        : uitje.labels,
      capaciteit: Math.max(1, alsGetal(req.body?.capaciteit, uitje.capaciteit)),
      geschiktheid: veiligeTekst(req.body?.geschiktheid) || null,
      status: ["actief", "geannuleerd"].includes(String(req.body?.status))
        ? String(req.body.status)
        : uitje.status,
    }
    const rij = await een<Uitje>(
      `update uitjes set datum=$1, begin_tijd=$2, eind_tijd=$3, omschrijving=$4, prijs=$5,
         extra_kosten=$6, labels=$7, capaciteit=$8, geschiktheid=$9, status=$10
       where id=$11 returning *`,
      [
        nieuw.datum, nieuw.begin_tijd, nieuw.eind_tijd, nieuw.omschrijving, nieuw.prijs,
        nieuw.extra_kosten, nieuw.labels, nieuw.capaciteit, nieuw.geschiktheid, nieuw.status,
        uitje.id,
      ],
    )
    const capaciteitGewijzigd = nieuw.capaciteit !== uitje.capaciteit

    // Meer plekken? Dan opnieuw kijken welke voertuigen nodig zijn en de eerste
    // reservist klaarzetten om te bellen.
    let reservist: Awaited<ReturnType<typeof vraagReservisten>> = null
    if (capaciteitGewijzigd && nieuw.capaciteit > uitje.capaciteit) {
      await koppelVoertuigenAutomatisch(uitje.id, nieuw.capaciteit)
      reservist = await vraagReservisten(uitje.id)
    }

    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "uitje",
      entiteitId: uitje.id,
      oudeWaarde: uitje,
      nieuweWaarde: nieuw,
      omschrijving: `${req.gebruiker!.naam} heeft uitje "${nieuw.omschrijving}" op ${datumLang(nieuw.datum)} gewijzigd${capaciteitGewijzigd ? `. De capaciteit is nu ${nieuw.capaciteit}; controleer de reservelijst` : ""}.${reserveZin(reservist)}`,
    })
    res.json({
      uitje: rij,
      bericht: `${capaciteitGewijzigd ? "De capaciteit is aangepast." : "Het uitje is bijgewerkt."}${reserveZin(reservist)}`,
      reservist,
    })
  }),
)

programmaRouter.post(
  "/uitje/:id/annuleer",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    await q("update uitjes set status = 'geannuleerd' where id = $1", [uitje.id])
    const deelnemers = await q<{ deelnemer_id: number; voornaam: string; tussenvoegsel: string | null; achternaam: string; telefoon: string | null; email: string | null; contactvoorkeur: string }>(
      `select distinct d.id as deelnemer_id, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon,
              d.email, d.contactvoorkeur
         from opgaven o join deelnemers d on d.id = o.deelnemer_id
        where o.uitje_id = $1 and d.status <> 'gestopt'`,
      [uitje.id],
    )
    const boodschap = `Het uitje ${uitje.omschrijving} op ${datumLang(uitje.datum)} gaat helaas niet door. Vertel dit en vraag of de deelnemer een ander uitje wil.`
    for (const deelnemer of deelnemers) {
      await q(
        `insert into bellijst (periode_id, uitje_id, deelnemer_id, type, boodschap, telefoon)
         values ($1,$2,$3,'annulering',$4,$5)`,
        [uitje.periode_id, uitje.id, deelnemer.deelnemer_id, boodschap, deelnemer.telefoon],
      )
    }
    await logWijziging(req, {
      actie: "annuleren",
      entiteit: "uitje",
      entiteitId: uitje.id,
      oudeWaarde: { status: uitje.status },
      nieuweWaarde: { status: "geannuleerd" },
      omschrijving: `${req.gebruiker!.naam} heeft uitje "${uitje.omschrijving}" op ${datumLang(uitje.datum)} geannuleerd. ${deelnemers.length} deelnemers staan op de bellijst.`,
    })
    res.json({ deelnemers, aantal: deelnemers.length })
  }),
)

programmaRouter.post(
  "/uitje/:id/afronden",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    const aanwezigen: number[] = Array.isArray(req.body?.aanwezig)
      ? req.body.aanwezig.map(Number).filter(Boolean)
      : []
    await q("delete from aanwezigheid where uitje_id = $1", [uitje.id])
    for (const deelnemerId of aanwezigen) {
      await q(
        "insert into aanwezigheid (uitje_id, deelnemer_id, aanwezig) values ($1,$2,true) on conflict do nothing",
        [uitje.id, deelnemerId],
      )
    }
    await q("update uitjes set afgerond_op = now() where id = $1", [uitje.id])
    await logWijziging(req, {
      actie: "afronden",
      entiteit: "uitje",
      entiteitId: uitje.id,
      omschrijving: `${req.gebruiker!.naam} heeft uitje "${uitje.omschrijving}" op ${datumLang(uitje.datum)} afgerond. ${aanwezigen.length} deelnemers waren aanwezig; de bezoekgeschiedenis is bijgewerkt.`,
    })
    res.json({ bericht: `Aanwezigheid opgeslagen voor ${aanwezigen.length} deelnemers.` })
  }),
)

programmaRouter.get(
  "/uitje/:id/deelnemerslijst",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    // Een chauffeur mag alleen de lijst van zijn eigen uitje zien.
    if (
      req.gebruiker!.rol_naam === "Chauffeur" &&
      !req.gebruiker!.rechten?.deelnemers?.zien
    ) {
      const eigen = await een(
        "select 1 from uitje_voertuigen where uitje_id = $1 and chauffeur_id = $2",
        [uitje.id, req.gebruiker!.id],
      )
      if (!eigen) {
        stuurFout(res, 403, "Je kunt alleen de deelnemerslijst van je eigen uitjes bekijken.")
        return
      }
    }
    const definitief = await een<{ id: number }>(
      "select id from indeling_runs where periode_id = $1 and modus = 'definitief' order by id desc limit 1",
      [uitje.periode_id],
    )
    const deelnemers = definitief
      ? await q(
          `select d.id, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon, d.mobiliteit,
                  d.heeft_mk, d.heeft_vl, d.opmerkingen, r.status, r.positie,
                  g.naam as groepje_naam
             from indeling_rijen r
             join deelnemers d on d.id = r.deelnemer_id
             left join groepje_leden gl on gl.deelnemer_id = d.id
             left join groepjes g on g.id = gl.groepje_id
            where r.run_id = $1 and r.uitje_id = $2
            order by case when r.status = 'geplaatst' then 0 else 1 end, r.positie nulls last, d.achternaam`,
          [definitief.id, uitje.id],
        )
      : await q(
          `select distinct d.id, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon, d.mobiliteit,
                  d.heeft_mk, d.heeft_vl, d.opmerkingen, 'aangemeld' as status, null::int as positie,
                  g.naam as groepje_naam
             from opgaven o
             join deelnemers d on d.id = o.deelnemer_id
             left join groepje_leden gl on gl.deelnemer_id = d.id
             left join groepjes g on g.id = gl.groepje_id
            where o.uitje_id = $1
            order by d.achternaam`,
          [uitje.id],
        )
    const aanwezig = await q<{ deelnemer_id: number }>(
      "select deelnemer_id from aanwezigheid where uitje_id = $1 and aanwezig",
      [uitje.id],
    )
    const voertuigen = await q(
      `select uv.id, uv.voertuig_id, v.naam, v.kenteken, v.capaciteit, uv.chauffeur_id, g.naam as chauffeur_naam,
              uv.begeleider_id, b.naam as begeleider_naam
         from uitje_voertuigen uv join voertuigen v on v.id = uv.voertuig_id
         left join gebruikers g on g.id = uv.chauffeur_id
         left join gebruikers b on b.id = uv.begeleider_id
        where uv.uitje_id = $1 order by v.capaciteit`,
      [uitje.id],
    )
    res.json({
      uitje,
      deelnemers,
      aanwezig: aanwezig.map((a) => a.deelnemer_id),
      voertuigen,
      heeftIndeling: Boolean(definitief),
    })
  }),
)

programmaRouter.post(
  "/uitje/:id/voertuigen",
  ah(async (req, res) => {
    const uitje = await haalUitje(Number(req.params.id))
    if (!uitje) {
      stuurFout(res, 404, "Dit uitje bestaat niet.")
      return
    }
    const voertuigId = Number(req.body?.voertuig_id)
    const chauffeurId = req.body?.chauffeur_id ? Number(req.body.chauffeur_id) : null
    const begeleiderId = req.body?.begeleider_id ? Number(req.body.begeleider_id) : null
    const voertuig = await een<{ id: number; capaciteit: number }>(
      "select * from voertuigen where id = $1",
      [voertuigId],
    )
    if (!voertuig) {
      stuurFout(res, 400, "Kies een voertuig.")
      return
    }
    const dubbel = await een(
      `select 1 from uitje_voertuigen uv join uitjes u on u.id = uv.uitje_id
        where uv.voertuig_id = $1 and u.datum = $2 and uv.uitje_id <> $3`,
      [voertuigId, uitje.datum, uitje.id],
    )
    if (dubbel) {
      stuurFout(res, 409, "Dit voertuig is op deze dag al voor een ander uitje ingezet.")
      return
    }
    await q(
      `insert into uitje_voertuigen (uitje_id, voertuig_id, chauffeur_id, begeleider_id)
       values ($1,$2,$3,$4)
       on conflict (uitje_id, voertuig_id) do update
         set chauffeur_id = excluded.chauffeur_id, begeleider_id = excluded.begeleider_id`,
      [uitje.id, voertuigId, chauffeurId, begeleiderId],
    )
    const totaal = await een<{ capaciteit: string }>(
      `select coalesce(sum(v.capaciteit),0)::text as capaciteit from uitje_voertuigen uv
        join voertuigen v on v.id = uv.voertuig_id where uv.uitje_id = $1`,
      [uitje.id],
    )
    await logWijziging(req, {
      actie: "voertuig-koppelen",
      entiteit: "uitje",
      entiteitId: uitje.id,
      omschrijving: `${req.gebruiker!.naam} heeft een voertuig gekoppeld aan "${uitje.omschrijving}" op ${datumLang(uitje.datum)}. Totale vervoerscapaciteit: ${totaal?.capaciteit}.`,
    })
    res.json({ bericht: "Voertuig gekoppeld.", vervoerscapaciteit: Number(totaal?.capaciteit ?? 0) })
  }),
)

programmaRouter.delete(
  "/uitje-voertuig/:id",
  ah(async (req, res) => {
    const rij = await een<{ uitje_id: number }>(
      "select uitje_id from uitje_voertuigen where id = $1",
      [Number(req.params.id)],
    )
    if (!rij) {
      stuurFout(res, 404, "Deze koppeling bestaat niet.")
      return
    }
    await q("delete from uitje_voertuigen where id = $1", [Number(req.params.id)])
    await logWijziging(req, {
      actie: "voertuig-ontkoppelen",
      entiteit: "uitje",
      entiteitId: rij.uitje_id,
      omschrijving: `${req.gebruiker!.naam} heeft een voertuig van een uitje gehaald.`,
    })
    res.json({ bericht: "Voertuig verwijderd." })
  }),
)

programmaRouter.get(
  "/:id/vervoer",
  ah(async (req, res) => {
    const periode = await haalPeriode(Number(req.params.id))
    if (!periode) {
      stuurFout(res, 404, "Deze periode bestaat niet.")
      return
    }
    const uitjes = await haalUitjes(periode.id)
    const resultaat = []
    for (const uitje of uitjes) {
      const voertuigen = await q(
        `select uv.id, v.naam, v.kenteken, v.capaciteit, uv.chauffeur_id, g.naam as chauffeur_naam,
                uv.begeleider_id, b.naam as begeleider_naam
           from uitje_voertuigen uv join voertuigen v on v.id = uv.voertuig_id
           left join gebruikers g on g.id = uv.chauffeur_id
           left join gebruikers b on b.id = uv.begeleider_id
          where uv.uitje_id = $1 order by v.capaciteit`,
        [uitje.id],
      )
      resultaat.push({
        ...uitje,
        voertuigen,
        vervoerscapaciteit: voertuigen.reduce((som, v) => som + Number(v.capaciteit), 0),
        chauffeurOntbreekt: voertuigen.some((v) => !v.chauffeur_id),
        begeleiderOntbreekt: voertuigen.some((v) => !v.begeleider_id),
      })
    }
    const voertuigen = await q("select * from voertuigen order by capaciteit")
    const chauffeurs = await q(
      `select g.id, g.naam from gebruikers g join rollen r on r.id = g.rol_id
        where g.actief and r.naam in ('Chauffeur','Admin','Beheerder','Coördinator')
        order by g.naam`,
    )
    const medewerkers = await q(
      `select g.id, g.naam from gebruikers g where g.actief order by g.naam`,
    )
    res.json({ periode, uitjes: resultaat, voertuigen, chauffeurs, medewerkers })
  }),
)

export { haalPeriode, haalUitjes, koppelVoertuigenAutomatisch }
