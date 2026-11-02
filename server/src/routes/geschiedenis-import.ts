/**
 * Bezoekgeschiedenis uit het oude systeem inladen (Excel of CSV).
 *
 * Een export uit het oude systeem bevat meestal één regel per bezoek:
 * datum, omschrijving van het uitje en de naam of het telefoonnummer van de
 * deelnemer. Die regels worden gekoppeld aan de al ingeladen deelnemers en als
 * historische uitjes met aanwezigheid opgeslagen, zodat de bezoekgeschiedenis
 * en de eerlijke indeling meteen kloppen.
 */
import { Router } from "express"
import * as XLSX from "xlsx"
import { metTransactie, q } from "../db"
import { logWijziging } from "../audit"
import { ah, stuurFout } from "../util"

export const geschiedenisImportRouter = Router()

const ARCHIEF_PERIODE = "Archief oude systeem"
const STANDAARD_UITJE = "Uitje (oud systeem)"

type DeelnemerKort = {
  id: number
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  telefoon_alt: string | null
}

export type ImportBezoek = {
  rij: number
  datum: string
  omschrijving: string
  deelnemer: string
  deelnemer_id: number | null
  fout: string | null
}

export type ImportGroep = {
  datum: string
  omschrijving: string
  deelnemers: { id: number; naam: string }[]
  bestond: boolean
}

const IMPORT_KOLOMMEN: Record<string, string> = {
  datum: "datum",
  date: "datum",
  dag: "datum",
  bezochtdatum: "datum",
  omschrijving: "omschrijving",
  uitje: "omschrijving",
  activiteit: "omschrijving",
  bezochteactiviteit: "omschrijving",
  onderdeel: "omschrijving",
  programma: "omschrijving",
  excursie: "omschrijving",
  naam: "volledige_naam",
  volledigenaam: "volledige_naam",
  deelnemer: "volledige_naam",
  voornaam: "voornaam",
  tussenvoegsel: "tussenvoegsel",
  achternaam: "achternaam",
  telefoon: "telefoon",
  telefoonnummer: "telefoon",
  mobiel: "telefoon",
  mobielnummer: "telefoon",
  tel: "telefoon",
}

function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

function cijfers(tekst: string): string {
  return tekst.replace(/\D/g, "")
}

function tweeCijfers(waarde: string): string {
  return waarde.padStart(2, "0")
}

/** Ondersteunt 2024-03-12, 12-3-2024, 12/03/24 en 12.3.2024. */
function datumUitTekst(tekst: string): string | null {
  const waarde = tekst.trim()
  if (!waarde) return null
  const iso = waarde.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return controleerDatum(`${iso[1]}-${tweeCijfers(iso[2])}-${tweeCijfers(iso[3])}`)
  const delen = waarde.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (delen) {
    const jaar = delen[3].length === 2 ? `20${delen[3]}` : delen[3]
    return controleerDatum(`${jaar}-${tweeCijfers(delen[2])}-${tweeCijfers(delen[1])}`)
  }
  return null
}

/** Weigert onmogelijke datums zoals 31-02-2024. */
function controleerDatum(waarde: string): string | null {
  const datum = new Date(`${waarde}T12:00:00Z`)
  if (Number.isNaN(datum.getTime()) || datum.toISOString().slice(0, 10) !== waarde) return null
  return waarde
}

/** Bovengrens voor uploads, zodat een groot of kwaadaardig bestand de server niet platlegt. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_IMPORT_RIJEN = 5000

function leesTabel(bestand: unknown): unknown[][] {
  const ruw = Buffer.isBuffer(bestand) ? bestand : Buffer.from(String(bestand), "base64")
  if (ruw.length > MAX_IMPORT_BYTES) throw new Error("Het bestand is te groot (maximaal 5 MB).")
  const werkboek = XLSX.read(ruw, { type: "buffer", cellDates: false })
  const eersteBlad = werkboek.SheetNames[0]
  if (!eersteBlad) throw new Error("Het bestand bevat geen werkblad.")
  const rijen = XLSX.utils.sheet_to_json<unknown[]>(werkboek.Sheets[eersteBlad], {
    header: 1,
    raw: false,
    defval: "",
    dateNF: "yyyy-mm-dd",
  }) as unknown[][]
  if (rijen.length > MAX_IMPORT_RIJEN) throw new Error("Het bestand bevat te veel rijen (maximaal 5000).")
  return rijen
}

async function haalDeelnemers(): Promise<DeelnemerKort[]> {
  return q<DeelnemerKort>(
    "select id, voornaam, tussenvoegsel, achternaam, telefoon, telefoon_alt from deelnemers",
  )
}

function maakZoeker(deelnemers: DeelnemerKort[]) {
  const opTelefoon = new Map<string, number>()
  const opNaam = new Map<string, number>()
  for (const deelnemer of deelnemers) {
    for (const nummer of [deelnemer.telefoon, deelnemer.telefoon_alt]) {
      const cijferNummer = cijfers(nummer ?? "")
      if (cijferNummer.length >= 7) opTelefoon.set(cijferNummer, deelnemer.id)
    }
    const naamSleutel = normaliseer(
      `${deelnemer.voornaam}${deelnemer.tussenvoegsel ?? ""}${deelnemer.achternaam}`,
    )
    if (naamSleutel) opNaam.set(naamSleutel, deelnemer.id)
  }
  return (naam: string, telefoon: string): number | null => {
    const cijferNummer = cijfers(telefoon)
    if (cijferNummer.length >= 7 && opTelefoon.has(cijferNummer)) {
      return opTelefoon.get(cijferNummer)!
    }
    const sleutel = normaliseer(naam)
    return sleutel ? (opNaam.get(sleutel) ?? null) : null
  }
}

async function haalArchiefUitjes(): Promise<{ datum: string; omschrijving: string }[]> {
  return q<{ datum: string; omschrijving: string }>(
    `select u.datum::text as datum, u.omschrijving
       from uitjes u join periodes p on p.id = u.periode_id
      where p.naam = $1`,
    [ARCHIEF_PERIODE],
  )
}

geschiedenisImportRouter.post(
  "/",
  ah(async (req, res) => {
    if (!req.body?.bestand) {
      stuurFout(res, 400, "Kies eerst een Excel- of CSV-bestand.")
      return
    }
    let rijen: unknown[][]
    try {
      rijen = leesTabel(req.body.bestand)
    } catch {
      stuurFout(res, 400, "Het bestand kon niet worden gelezen. Gebruik een Excel- of CSV-bestand.")
      return
    }

    const kopRij = rijen.findIndex((rij) =>
      (rij as unknown[]).some((cel) => normaliseer(String(cel ?? "")) === "datum"),
    )
    if (kopRij === -1) {
      stuurFout(
        res,
        400,
        "Ik kan de kolomnamen niet vinden. Zet in de bovenste regel bijvoorbeeld: datum, omschrijving, naam.",
      )
      return
    }

    const deelnemers = await haalDeelnemers()
    const zoekDeelnemer = maakZoeker(deelnemers)
    const bestaandeUitjes = await haalArchiefUitjes()
    const bestaandeSleutels = new Set(
      bestaandeUitjes.map((uitje) => `${uitje.datum.slice(0, 10)}|${normaliseer(uitje.omschrijving)}`),
    )
    const naamPerId = new Map(deelnemers.map((deelnemer) => [deelnemer.id, deelnemer]))

    const koppen = (rijen[kopRij] as unknown[]).map((cel) => IMPORT_KOLOMMEN[normaliseer(String(cel ?? ""))])
    const regels: ImportBezoek[] = []
    const groepen = new Map<string, ImportGroep>()

    rijen.slice(kopRij + 1).forEach((ruweRij, index) => {
      const cellen = (ruweRij as unknown[]).map((cel) => String(cel ?? "").trim())
      if (cellen.every((cel) => !cel)) return
      const veld = (naam: string): string => {
        const kolom = koppen.indexOf(naam)
        return kolom === -1 ? "" : (cellen[kolom] ?? "").trim()
      }

      const volledig = veld("volledige_naam")
      const naam =
        volledig ||
        [veld("voornaam"), veld("tussenvoegsel"), veld("achternaam")].filter(Boolean).join(" ").trim()
      const datum = datumUitTekst(veld("datum"))
      const omschrijving = veld("omschrijving") || STANDAARD_UITJE

      let fout: string | null = null
      if (!datum) fout = "Geen geldige datum in deze regel."
      if (!naam) fout = "Geen naam in deze regel."

      const deelnemerId = fout ? null : zoekDeelnemer(naam, veld("telefoon"))
      if (!fout && deelnemerId === null) {
        fout = "Deze deelnemer staat nog niet in het systeem. Laad eerst de deelnemers in."
      }

      const deelnemer = deelnemerId === null ? naam : null
      const deelnemerRij = deelnemerId === null ? undefined : naamPerId.get(deelnemerId)
      regels.push({
        rij: kopRij + index + 2,
        datum: datum ?? veld("datum"),
        omschrijving,
        deelnemer:
          deelnemer ??
          (deelnemerRij
            ? `${deelnemerRij.voornaam} ${deelnemerRij.tussenvoegsel ?? ""} ${deelnemerRij.achternaam}`
                .replace(/\s+/g, " ")
                .trim()
            : ""),
        deelnemer_id: deelnemerId,
        fout,
      })

      if (!datum || deelnemerId === null) return
      const sleutel = `${datum}|${normaliseer(omschrijving)}`
      const groep = groepen.get(sleutel) ?? {
        datum,
        omschrijving,
        deelnemers: [],
        bestond: bestaandeSleutels.has(sleutel),
      }
      if (!groep.deelnemers.some((iemand) => iemand.id === deelnemerId)) {
        groep.deelnemers.push({ id: deelnemerId, naam: regels[regels.length - 1].deelnemer })
      }
      groepen.set(sleutel, groep)
    })

    if (regels.length === 0) {
      stuurFout(res, 400, "Er staan geen bezoeken in dit bestand.")
      return
    }

    const lijst = [...groepen.values()]
    const uniekeDeelnemers = new Set(regels.map((regel) => regel.deelnemer_id).filter(Boolean))
    res.json({
      regels,
      groepen: lijst,
      aantal: regels.length,
      ongeldig: regels.filter((regel) => regel.fout).length,
      deelnemers: uniekeDeelnemers.size,
      nieuwe_uitjes: lijst.filter((groep) => !groep.bestond).length,
      bestaande_uitjes: lijst.filter((groep) => groep.bestond).length,
    })
  }),
)

geschiedenisImportRouter.post(
  "/bevestig",
  ah(async (req, res) => {
    const groepen = Array.isArray(req.body?.groepen) ? (req.body.groepen as ImportGroep[]) : []
    const geldig = groepen
      .map((groep) => ({
        datum: datumUitTekst(String(groep?.datum ?? "")),
        omschrijving: String(groep?.omschrijving ?? "").trim() || STANDAARD_UITJE,
        deelnemers: Array.isArray(groep?.deelnemers)
          ? [...new Set(groep.deelnemers.map((iemand) => Number(iemand?.id)).filter(Number.isInteger))]
          : [],
      }))
      .filter((groep) => groep.datum && groep.deelnemers.length > 0)

    if (geldig.length === 0) {
      stuurFout(res, 400, "Er zijn geen bezoeken om op te slaan.")
      return
    }
    if (geldig.length > 2000) {
      stuurFout(res, 400, "Er zijn te veel uitjes om in één keer op te slaan (maximaal 2000).")
      return
    }
    if (geldig.some((groep) => groep.omschrijving.length > 200)) {
      stuurFout(res, 400, "Een omschrijving is te lang (maximaal 200 tekens).")
      return
    }
    // De bevestiging komt uit de browser: controleer dat elke deelnemer echt bestaat.
    const alleDeelnemers = [...new Set(geldig.flatMap((groep) => groep.deelnemers))]
    const bestaandeDeelnemers = await q<{ id: number }>(
      "select id from deelnemers where id = any($1::int[])",
      [alleDeelnemers],
    )
    if (bestaandeDeelnemers.length !== alleDeelnemers.length) {
      stuurFout(res, 400, "Er staan deelnemers in de bevestiging die niet in het systeem bestaan.")
      return
    }

    const datums = geldig.map((groep) => groep.datum as string).sort()
    const eerste = datums[0]
    const laatste = datums[datums.length - 1]

    let toegevoegd = 0
    // Alles in één transactie: een fout halverwege laat geen halve import achter.
    await metTransactie(async (client) => {
      const bestaandePeriode = await client.query<{ id: number }>(
        "select id from periodes where naam = $1",
        [ARCHIEF_PERIODE],
      )
      let periodeId = bestaandePeriode.rows[0]?.id
      if (!periodeId) {
        const nieuw = await client.query<{ id: number }>(
          `insert into periodes (naam, start_op, eind_op, aanmelddeadline, status, standaard_capaciteit)
           values ($1,$2,$3,$2,'gesloten',14) returning id`,
          [ARCHIEF_PERIODE, eerste, laatste],
        )
        periodeId = nieuw.rows[0].id
      }
      await client.query(
        `update periodes set start_op = least(start_op, $2), eind_op = greatest(eind_op, $3)
          where id = $1`,
        [periodeId, eerste, laatste],
      )
      for (const groep of geldig) {
        const bestaandUitje = await client.query<{ id: number }>(
          `select id from uitjes
            where periode_id = $1 and datum = $2 and lower(trim(omschrijving)) = lower(trim($3))
            limit 1`,
          [periodeId, groep.datum, groep.omschrijving],
        )
        let uitjeId = bestaandUitje.rows[0]?.id
        if (!uitjeId) {
          const nieuwUitje = await client.query<{ id: number }>(
            `insert into uitjes
              (periode_id, datum, omschrijving, capaciteit, status, bron, afgerond_op)
             values ($1,$2,$3,$4,'actief','import',now()) returning id`,
            [periodeId, groep.datum, groep.omschrijving, groep.deelnemers.length],
          )
          uitjeId = nieuwUitje.rows[0].id
        }
        for (const deelnemerId of groep.deelnemers) {
          const rij = await client.query(
            `insert into aanwezigheid (uitje_id, deelnemer_id, aanwezig) values ($1,$2,true)
             on conflict (uitje_id, deelnemer_id) do nothing returning deelnemer_id`,
            [uitjeId, deelnemerId],
          )
          if (rij.rowCount) toegevoegd += 1
        }
      }
    })

    await logWijziging(req, {
      actie: "importeren",
      entiteit: "deelnemer",
      omschrijving: `${req.gebruiker!.naam} heeft de bezoekgeschiedenis uit het oude systeem ingeladen: ${toegevoegd} bezoeken in ${geldig.length} uitjes.`,
    })

    res.status(201).json({
      toegevoegd,
      uitjes: geldig.length,
      bericht: `${toegevoegd} bezoeken toegevoegd uit het oude systeem (${geldig.length} uitjes).`,
    })
  }),
)
