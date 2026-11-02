import { Router } from "express"
import * as XLSX from "xlsx"
import { een, q } from "../db"
import { logWijziging } from "../audit"
import { ah, instelling, naam, stuurFout, veiligeTekst } from "../util"
import { geschiedenisImportRouter } from "./geschiedenis-import"

export const deelnemersRouter = Router()

export type DeelnemerRij = {
  id: number
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string | null
  telefoon_alt: string | null
  email: string | null
  contactvoorkeur: string
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  plaats: string | null
  opmerkingen: string | null
  mobiliteit: string[]
  heeft_mk: boolean
  heeft_vl: boolean
  noodcontact_naam: string | null
  noodcontact_telefoon: string | null
  status: string
  gestopt_op: string | null
  geanonimiseerd: boolean
  aangemaakt: string
  totaal_deelnames: number
  aantal_12m: number
  laatste_deelname: string | null
  groepje_id: number | null
  groepje_naam: string | null
}

function normaliseer(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

function cijfers(tekst: string | null | undefined): string {
  return (tekst ?? "").replace(/\D/g, "")
}

function afstand(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let vorige = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const huidige = [i]
    for (let j = 1; j <= b.length; j++) {
      huidige[j] = Math.min(
        vorige[j] + 1,
        huidige[j - 1] + 1,
        vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    vorige = huidige
  }
  return vorige[b.length]
}

export function zoekScore(deelnemer: DeelnemerRij, zoekterm: string): number {
  const term = normaliseer(zoekterm)
  if (!term) return 1
  const volledigeNaam = normaliseer(naam(deelnemer))
  const woorden = volledigeNaam.length > 0 ? volledigeNaam.split(/(?=[a-z])/) : []
  void woorden
  const delen = [deelnemer.voornaam, deelnemer.tussenvoegsel, deelnemer.achternaam]
    .filter(Boolean)
    .map((deel) => normaliseer(deel as string))

  const zoekCijfers = cijfers(zoekterm)
  if (zoekCijfers.length >= 3) {
    const telefoons = [cijfers(deelnemer.telefoon), cijfers(deelnemer.telefoon_alt)]
    if (telefoons.some((nummer) => nummer.includes(zoekCijfers))) return 100
  }
  if (volledigeNaam.startsWith(term)) return 95
  if (volledigeNaam.includes(term)) return 85
  if (delen.some((deel) => deel.startsWith(term))) return 78
  if (delen.some((deel) => deel.includes(term))) return 66
  for (const deel of delen) {
    if (deel.length > 2 && afstand(deel.slice(0, Math.max(term.length, 3)), term) <= 2) return 55
  }
  // Twee losse woorden in willekeurige volgorde ("vries jan").
  const termDelen = zoekterm.toLowerCase().split(/\s+/).map(normaliseer).filter(Boolean)
  if (
    termDelen.length > 1 &&
    termDelen.every((deelTerm) => delen.some((deel) => deel.includes(deelTerm)))
  ) {
    return 88
  }
  return 0
}

async function haalDeelnemers(): Promise<DeelnemerRij[]> {
  const maanden = Number(await instelling("terugkijk_maanden", "12"))
  return q<DeelnemerRij>(
    `select d.*,
       (select count(*) from aanwezigheid a where a.deelnemer_id = d.id and a.aanwezig)::int as totaal_deelnames,
       (select count(*) from aanwezigheid a join uitjes u on u.id = a.uitje_id
          where a.deelnemer_id = d.id and a.aanwezig
            and u.datum >= (current_date - make_interval(months => $1)))::int as aantal_12m,
       (select max(u.datum) from aanwezigheid a join uitjes u on u.id = a.uitje_id
          where a.deelnemer_id = d.id and a.aanwezig) as laatste_deelname,
       g.id as groepje_id, g.naam as groepje_naam
     from deelnemers d
     left join groepje_leden gl on gl.deelnemer_id = d.id
     left join groepjes g on g.id = gl.groepje_id
     order by d.achternaam, d.voornaam`,
    [maanden],
  )
}

deelnemersRouter.get(
  "/",
  ah(async (req, res) => {
    const zoekterm = veiligeTekst(req.query.q)
    const status = veiligeTekst(req.query.status)
    let lijst = await haalDeelnemers()
    if (status && status !== "alles") lijst = lijst.filter((d) => d.status === status)
    if (zoekterm) {
      lijst = lijst
        .map((d) => ({ deelnemer: d, score: zoekScore(d, zoekterm) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || naam(a.deelnemer).localeCompare(naam(b.deelnemer)))
        .map((item) => item.deelnemer)
        .slice(0, 40)
    }
    res.json({ deelnemers: lijst })
  }),
)

deelnemersRouter.get(
  "/export",
  ah(async (_req, res) => {
    const lijst = await haalDeelnemers()
    const kop = [
      "voornaam", "tussenvoegsel", "achternaam", "telefoon", "telefoon_alt", "email",
      "contactvoorkeur", "straat", "huisnummer", "postcode", "plaats", "status",
      "mobiliteit", "museumkaart", "vipkaart", "totaal_deelnames",
    ]
    const regels = lijst.map((d) =>
      [
        d.voornaam, d.tussenvoegsel ?? "", d.achternaam, d.telefoon ?? "", d.telefoon_alt ?? "",
        d.email ?? "", d.contactvoorkeur, d.straat ?? "", d.huisnummer ?? "", d.postcode ?? "",
        d.plaats ?? "", d.status, (d.mobiliteit ?? []).join("; "), d.heeft_mk ? "ja" : "nee",
        d.heeft_vl ? "ja" : "nee", String(d.totaal_deelnames),
      ]
        .map((veld) => {
          // Een cel die met =, +, - of @ begint, voert in Excel een formule uit.
          const tekst = String(veld ?? "")
          return `"${(/^[=+\-@\t\r]/.test(tekst) ? `'${tekst}` : tekst).replaceAll('"', '""')}"`
        })
        .join(";"),
    )
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="deelnemers.csv"')
    res.send("\uFEFF" + [kop.join(";"), ...regels].join("\r\n"))
  }),
)

deelnemersRouter.get(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const deelnemer = (await haalDeelnemers()).find((d) => d.id === id)
    if (!deelnemer) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    const geschiedenis = await q(
      `select u.id, u.datum, u.omschrijving, u.prijs, p.naam as periode_naam
         from aanwezigheid a
         join uitjes u on u.id = a.uitje_id
         join periodes p on p.id = u.periode_id
        where a.deelnemer_id = $1 and a.aanwezig
        order by u.datum desc`,
      [id],
    )
    const opgaven = await q(
      `select o.id, o.uitje_id, o.reeks_keuze, o.met_groepje, o.notitie, u.datum,
              u.omschrijving, u.begin_tijd, u.eind_tijd, p.id as periode_id, p.naam as periode_naam,
              p.status as periode_status, p.aanmelddeadline
         from opgaven o
         join uitjes u on u.id = o.uitje_id
         join periodes p on p.id = u.periode_id
        where o.deelnemer_id = $1
        order by u.datum`,
      [id],
    )
    const groepje = deelnemer.groepje_id
      ? await q(
          `select d.id, d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon
             from groepje_leden gl join deelnemers d on d.id = gl.deelnemer_id
            where gl.groepje_id = $1 and d.id <> $2 order by d.achternaam`,
          [deelnemer.groepje_id, id],
        )
      : []
    res.json({ deelnemer, geschiedenis, opgaven, groepje })
  }),
)

function deelnemerVelden(body: Record<string, unknown>) {
  return {
    voornaam: veiligeTekst(body.voornaam),
    tussenvoegsel: veiligeTekst(body.tussenvoegsel) || null,
    achternaam: veiligeTekst(body.achternaam),
    telefoon: veiligeTekst(body.telefoon) || null,
    telefoon_alt: veiligeTekst(body.telefoon_alt) || null,
    email: veiligeTekst(body.email) || null,
    contactvoorkeur: ["telefoon", "email", "beide"].includes(String(body.contactvoorkeur))
      ? String(body.contactvoorkeur)
      : "telefoon",
    straat: veiligeTekst(body.straat) || null,
    huisnummer: veiligeTekst(body.huisnummer) || null,
    postcode: veiligeTekst(body.postcode) || null,
    plaats: veiligeTekst(body.plaats) || null,
    opmerkingen: veiligeTekst(body.opmerkingen) || null,
    mobiliteit: Array.isArray(body.mobiliteit)
      ? body.mobiliteit.map((m) => String(m)).filter(Boolean)
      : [],
    heeft_mk: body.heeft_mk === true,
    heeft_vl: body.heeft_vl === true,
    noodcontact_naam: veiligeTekst(body.noodcontact_naam) || null,
    noodcontact_telefoon: veiligeTekst(body.noodcontact_telefoon) || null,
    status: ["actief", "gepauzeerd", "gestopt"].includes(String(body.status))
      ? String(body.status)
      : "actief",
  }
}

function mogelijkeDuplicaten(
  lijst: DeelnemerRij[],
  velden: ReturnType<typeof deelnemerVelden>,
  negeerId?: number,
): DeelnemerRij[] {
  const nieuwNaam = normaliseer(`${velden.voornaam}${velden.achternaam}`)
  const nieuwTelefoon = cijfers(velden.telefoon)
  return lijst.filter((bestaand) => {
    if (bestaand.id === negeerId || bestaand.geanonimiseerd) return false
    const bestaandNaam = normaliseer(`${bestaand.voornaam}${bestaand.achternaam}`)
    if (nieuwTelefoon.length >= 7 && cijfers(bestaand.telefoon) === nieuwTelefoon) return true
    if (nieuwNaam && bestaandNaam === nieuwNaam) return true
    return nieuwNaam.length > 4 && afstand(nieuwNaam, bestaandNaam) <= 1
  })
}

deelnemersRouter.post(
  "/",
  ah(async (req, res) => {
    const velden = deelnemerVelden(req.body ?? {})
    if (!velden.voornaam || !velden.achternaam) {
      stuurFout(res, 400, "Vul in ieder geval een voornaam en achternaam in.")
      return
    }
    if (req.body?.negeer_duplicaat !== true) {
      const duplicaten = mogelijkeDuplicaten(await haalDeelnemers(), velden)
      if (duplicaten.length > 0) {
        res.status(409).json({
          fout: "Deze deelnemer lijkt al te bestaan. Controleer het even.",
          duplicaten,
        })
        return
      }
    }
    const rij = await een<DeelnemerRij>(
      `insert into deelnemers
        (voornaam, tussenvoegsel, achternaam, telefoon, telefoon_alt, email, contactvoorkeur,
         straat, huisnummer, postcode, plaats, opmerkingen, mobiliteit, heeft_mk, heeft_vl,
         noodcontact_naam, noodcontact_telefoon, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning *`,
      [
        velden.voornaam, velden.tussenvoegsel, velden.achternaam, velden.telefoon,
        velden.telefoon_alt, velden.email, velden.contactvoorkeur, velden.straat,
        velden.huisnummer, velden.postcode, velden.plaats, velden.opmerkingen,
        velden.mobiliteit, velden.heeft_mk, velden.heeft_vl, velden.noodcontact_naam,
        velden.noodcontact_telefoon, velden.status,
      ],
    )
    await logWijziging(req, {
      actie: "aanmaken",
      entiteit: "deelnemer",
      entiteitId: rij!.id,
      nieuweWaarde: velden,
      omschrijving: `${req.gebruiker!.naam} heeft ${naam(rij!)} als deelnemer vastgelegd.`,
    })
    res.status(201).json({ deelnemer: rij })
  }),
)

deelnemersRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const bestaand = (await haalDeelnemers()).find((d) => d.id === id)
    if (!bestaand) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    const velden = deelnemerVelden({ ...bestaand, ...req.body })
    if (!velden.voornaam || !velden.achternaam) {
      stuurFout(res, 400, "Vul in ieder geval een voornaam en achternaam in.")
      return
    }
    const rij = await een<DeelnemerRij>(
      `update deelnemers set
         voornaam=$1, tussenvoegsel=$2, achternaam=$3, telefoon=$4, telefoon_alt=$5,
         email=$6, contactvoorkeur=$7, straat=$8, huisnummer=$9, postcode=$10, plaats=$11,
         opmerkingen=$12, mobiliteit=$13, heeft_mk=$14, heeft_vl=$15, noodcontact_naam=$16,
         noodcontact_telefoon=$17, status=$18, gestopt_op=$19, gewijzigd=now()
       where id=$20 returning *`,
      [
        velden.voornaam, velden.tussenvoegsel, velden.achternaam, velden.telefoon,
        velden.telefoon_alt, velden.email, velden.contactvoorkeur, velden.straat,
        velden.huisnummer, velden.postcode, velden.plaats, velden.opmerkingen,
        velden.mobiliteit, velden.heeft_mk, velden.heeft_vl, velden.noodcontact_naam,
        velden.noodcontact_telefoon, velden.status,
        velden.status === "gestopt" ? (bestaand.gestopt_op ?? new Date().toISOString().slice(0, 10)) : null,
        id,
      ],
    )
    await logWijziging(req, {
      actie: "wijzigen",
      entiteit: "deelnemer",
      entiteitId: id,
      oudeWaarde: bestaand,
      nieuweWaarde: velden,
      omschrijving: `${req.gebruiker!.naam} heeft ${naam(rij!)} gewijzigd.`,
    })
    res.json({ deelnemer: rij })
  }),
)

deelnemersRouter.post(
  "/:id/anonimiseren",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const bestaand = (await haalDeelnemers()).find((d) => d.id === id)
    if (!bestaand) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    if (req.body?.bevestig !== true) {
      stuurFout(res, 400, "Bevestig eerst dat de gegevens anoniem gemaakt mogen worden.")
      return
    }
    await q(
      `update deelnemers set
         voornaam = 'Deelnemer', tussenvoegsel = null, achternaam = 'verwijderd',
         telefoon = null, telefoon_alt = null, email = null, contactvoorkeur = 'telefoon',
         straat = null, huisnummer = null, postcode = null, plaats = null, opmerkingen = null,
         mobiliteit = '{}', heeft_mk = false, heeft_vl = false, noodcontact_naam = null,
         noodcontact_telefoon = null, status = 'gestopt', gestopt_op = current_date,
         geanonimiseerd = true, gewijzigd = now()
       where id = $1`,
      [id],
    )
    await q("delete from groepje_leden where deelnemer_id = $1", [id])
    await q("delete from opgaven where deelnemer_id = $1", [id])
    await logWijziging(req, {
      actie: "anonimiseren",
      entiteit: "deelnemer",
      entiteitId: id,
      oudeWaarde: { naam: naam(bestaand), telefoon: bestaand.telefoon },
      omschrijving: `${req.gebruiker!.naam} heeft de persoonsgegevens van ${naam(bestaand)} op verzoek verwijderd (AVG). De bezoekgeschiedenis blijft anoniem bewaard.`,
    })
    res.json({ bericht: "De persoonsgegevens zijn verwijderd. De bezoekgeschiedenis blijft anoniem bewaard." })
  }),
)

deelnemersRouter.get(
  "/:id/avg-overzicht",
  ah(async (req, res) => {
    const id = Number(req.params.id)
    const deelnemer = (await haalDeelnemers()).find((d) => d.id === id)
    if (!deelnemer) {
      stuurFout(res, 404, "Deze deelnemer bestaat niet.")
      return
    }
    const geschiedenis = await q(
      `select u.datum, u.omschrijving from aanwezigheid a
         join uitjes u on u.id = a.uitje_id where a.deelnemer_id = $1 and a.aanwezig
        order by u.datum desc`,
      [id],
    )
    const opgaven = await q(
      `select u.datum, u.omschrijving, o.aangemaakt from opgaven o
         join uitjes u on u.id = o.uitje_id where o.deelnemer_id = $1 order by u.datum`,
      [id],
    )
    const log = await q(
      `select tijd, gebruiker_naam, omschrijving from audit_log
        where entiteit = 'deelnemer' and entiteit_id = $1 order by tijd desc`,
      [String(id)],
    )
    await logWijziging(req, {
      actie: "avg-inzage",
      entiteit: "deelnemer",
      entiteitId: id,
      omschrijving: `${req.gebruiker!.naam} heeft het AVG-overzicht van ${naam(deelnemer)} opgevraagd.`,
    })
    res.setHeader("Content-Disposition", `attachment; filename="avg-overzicht-${id}.json"`)
    res.json({ deelnemer, geschiedenis, opgaven, log })
  }),
)

// ---------------------------------------------------------------- importeren

deelnemersRouter.use("/import/geschiedenis", geschiedenisImportRouter)

const MOBILITEIT_WAARDEN = ["rollator", "rolstoel", "hulp bij instappen"]

/** Kolomnamen die we herkennen. Sleutel is de genormaliseerde kolomkop. */
const IMPORT_KOLOMMEN: Record<string, string> = {
  voornaam: "voornaam",
  roepnaam: "voornaam",
  tussenvoegsel: "tussenvoegsel",
  achternaam: "achternaam",
  naam: "volledige_naam",
  volledigenaam: "volledige_naam",
  telefoon: "telefoon",
  telefoonnummer: "telefoon",
  mobiel: "telefoon",
  mobielnummer: "telefoon",
  tel: "telefoon",
  telefoon2: "telefoon_alt",
  telefoonnummer2: "telefoon_alt",
  tweedetelefoon: "telefoon_alt",
  email: "email",
  emailadres: "email",
  straat: "straat",
  straatnaam: "straat",
  adres: "straat",
  huisnummer: "huisnummer",
  nr: "huisnummer",
  postcode: "postcode",
  plaats: "plaats",
  woonplaats: "plaats",
  stad: "plaats",
  opmerkingen: "opmerkingen",
  opmerking: "opmerkingen",
  notities: "opmerkingen",
  bijzonderheden: "opmerkingen",
  mobiliteit: "mobiliteit",
  hulpmiddel: "mobiliteit",
  hulpmiddelen: "mobiliteit",
}

export type ImportDeelnemer = {
  rij: number
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  telefoon: string
  telefoon_alt: string
  email: string
  straat: string
  huisnummer: string
  postcode: string
  plaats: string
  opmerkingen: string
  mobiliteit: string[]
  fouten: string[]
  duplicaat: string | null
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
  }) as unknown[][]
  if (rijen.length > MAX_IMPORT_RIJEN) throw new Error("Het bestand bevat te veel rijen (maximaal 5000).")
  return rijen
}

function parseDeelnemers(rijen: unknown[][], bestaand: DeelnemerRij[]): ImportDeelnemer[] {
  const kopRij = rijen.findIndex((rij) =>
    (rij as unknown[]).some((cel) => {
      const kop = normaliseer(String(cel ?? ""))
      return kop === "achternaam" || kop === "voornaam" || kop === "naam"
    }),
  )
  if (kopRij === -1) {
    throw new Error(
      "Ik kan de kolomnamen niet vinden. Zet in de bovenste regel bijvoorbeeld: voornaam, achternaam, telefoon, straat, huisnummer, postcode, plaats.",
    )
  }
  const koppen = (rijen[kopRij] as unknown[]).map((cel) => IMPORT_KOLOMMEN[normaliseer(String(cel ?? ""))])
  const resultaat: ImportDeelnemer[] = []
  const gezienTelefoon = new Set<string>()
  const gezienNaam = new Set<string>()

  rijen.slice(kopRij + 1).forEach((ruweRij, index) => {
    const cellen = (ruweRij as unknown[]).map((cel) => String(cel ?? "").trim())
    if (cellen.every((cel) => !cel)) return
    const veld = (naam: string): string => {
      const kolom = koppen.indexOf(naam)
      return kolom === -1 ? "" : (cellen[kolom] ?? "").trim()
    }
    let voornaam = veld("voornaam")
    let tussenvoegsel = veld("tussenvoegsel")
    let achternaam = veld("achternaam")
    const volledig = veld("volledige_naam")
    if (volledig && !achternaam) {
      const delen = volledig.split(/\s+/)
      voornaam = voornaam || delen[0] || ""
      achternaam = delen.slice(1).join(" ")
    }
    const telefoon = veld("telefoon")
    const mobiliteit = veld("mobiliteit")
      .split(/[,;/]+/)
      .map((deel) => normaliseer(deel))
      .map((deel) => MOBILITEIT_WAARDEN.find((waarde) => normaliseer(waarde) === deel))
      .filter((waarde): waarde is string => Boolean(waarde))

    const regel: ImportDeelnemer = {
      rij: kopRij + index + 2,
      voornaam,
      tussenvoegsel,
      achternaam,
      telefoon,
      telefoon_alt: veld("telefoon_alt"),
      email: veld("email"),
      straat: veld("straat"),
      huisnummer: veld("huisnummer"),
      postcode: veld("postcode").toUpperCase(),
      plaats: veld("plaats"),
      opmerkingen: veld("opmerkingen"),
      mobiliteit,
      fouten: [],
      duplicaat: null,
    }

    if (!regel.voornaam && !regel.achternaam) {
      regel.fouten.push("Geen naam gevonden in deze regel.")
    }
    const cijferTelefoon = cijfers(regel.telefoon)
    if (cijferTelefoon.length >= 7) {
      if (gezienTelefoon.has(cijferTelefoon)) {
        regel.fouten.push("Hetzelfde telefoonnummer staat vaker in dit bestand.")
      }
      gezienTelefoon.add(cijferTelefoon)
    }
    const naamSleutel = normaliseer(`${regel.voornaam}${regel.achternaam}`)
    if (naamSleutel) {
      if (gezienNaam.has(naamSleutel)) {
        regel.fouten.push("Deze naam staat vaker in dit bestand.")
      }
      gezienNaam.add(naamSleutel)
    }

    if (regel.fouten.length === 0) {
      const dubbel = mogelijkeDuplicaten(bestaand, {
        voornaam: regel.voornaam || regel.achternaam,
        achternaam: regel.achternaam,
        telefoon: regel.telefoon,
      } as DeelnemerRij)
      if (dubbel.length > 0) {
        regel.duplicaat = naam(dubbel[0])
      }
    }

    resultaat.push(regel)
  })
  return resultaat
}

deelnemersRouter.post(
  "/import",
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
    let regels: ImportDeelnemer[]
    try {
      regels = parseDeelnemers(rijen, await haalDeelnemers())
    } catch (fout) {
      stuurFout(res, 400, fout instanceof Error ? fout.message : "Het bestand kon niet worden gelezen.")
      return
    }
    if (regels.length === 0) {
      stuurFout(res, 400, "Er staan geen deelnemers in dit bestand.")
      return
    }
    res.json({
      regels,
      aantal: regels.length,
      fouten: regels.filter((regel) => regel.fouten.length > 0).length,
      duplicaten: regels.filter((regel) => regel.duplicaat).length,
    })
  }),
)

deelnemersRouter.post(
  "/import/bevestig",
  ah(async (req, res) => {
    const regels = Array.isArray(req.body?.regels) ? (req.body.regels as ImportDeelnemer[]) : []
    const negeerDuplicaten = req.body?.negeer_duplicaten === true
    const opslaan = regels.filter(
      (regel) => (regel.fouten ?? []).length === 0 && (negeerDuplicaten || !regel.duplicaat),
    )
    if (opslaan.length === 0) {
      stuurFout(res, 400, "Er zijn geen regels zonder fout om op te slaan.")
      return
    }
    for (const regel of opslaan) {
      await q(
        `insert into deelnemers
          (voornaam, tussenvoegsel, achternaam, telefoon, telefoon_alt, email, contactvoorkeur,
           straat, huisnummer, postcode, plaats, opmerkingen, mobiliteit, status)
         values ($1,$2,$3,$4,$5,$6,'telefoon',$7,$8,$9,$10,$11,$12,'actief')`,
        [
          regel.voornaam || "-",
          regel.tussenvoegsel || null,
          regel.achternaam || "-",
          regel.telefoon || null,
          regel.telefoon_alt || null,
          regel.email || null,
          regel.straat || null,
          regel.huisnummer || null,
          regel.postcode || null,
          regel.plaats || null,
          regel.opmerkingen || null,
          Array.isArray(regel.mobiliteit) ? regel.mobiliteit : [],
        ],
      )
    }
    const overgeslagen = regels.length - opslaan.length
    await logWijziging(req, {
      actie: "importeren",
      entiteit: "deelnemer",
      omschrijving: `${req.gebruiker!.naam} heeft ${opslaan.length} deelnemers uit Excel/CSV ingeladen${overgeslagen ? `; ${overgeslagen} regels overgeslagen` : ""}.`,
    })
    res.status(201).json({
      toegevoegd: opslaan.length,
      overgeslagen,
      bericht: `${opslaan.length} deelnemers toegevoegd${overgeslagen ? `, ${overgeslagen} regels overgeslagen` : ""}.`,
    })
  }),
)
