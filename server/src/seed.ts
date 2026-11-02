import { een, q } from "./db"
import { hashWachtwoord } from "./auth"
import { RECHTEN_ACTIES, RECHTEN_ONDERDELEN } from "./schema"

function rechten(volledig: boolean, zichtbaar: string[], verwijderbaar: string[] = []) {
  const resultaat: Record<string, Record<string, boolean>> = {}
  for (const onderdeel of RECHTEN_ONDERDELEN) {
    const isZichtbaar = volledig || zichtbaar.includes(onderdeel.sleutel)
    resultaat[onderdeel.sleutel] = {}
    for (const actie of RECHTEN_ACTIES) {
      resultaat[onderdeel.sleutel][actie] =
        actie === "verwijderen" && !volledig
          ? verwijderbaar.includes(onderdeel.sleutel)
          : isZichtbaar
    }
  }
  return resultaat
}

const DEMO_WACHTWOORD = "welkom123"

const DEELNEMERS: {
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  telefoon: string
  straat: string
  huisnummer: string
  postcode: string
  plaats: string
  email: string | null
  contactvoorkeur: string
  mobiliteit: string[]
  heeftMk: boolean
  heeftVl: boolean
  noodcontactNaam: string | null
  noodcontactTelefoon: string | null
}[] = [
  { voornaam: "Jan", tussenvoegsel: null, achternaam: "de Vries", telefoon: "06-12345678", straat: "Kerkstraat", huisnummer: "12", postcode: "1315 AB", plaats: "Almere", email: "jan.devries@voorbeeld.nl", contactvoorkeur: "beide", mobiliteit: ["rollator"], heeftMk: true, heeftVl: false, noodcontactNaam: "Erik de Vries", noodcontactTelefoon: "06-11112222" },
  { voornaam: "Piet", tussenvoegsel: null, achternaam: "Jansen", telefoon: "06-23456789", straat: "Kerkstraat", huisnummer: "14", postcode: "1315 AB", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: [], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Anna", tussenvoegsel: "van", achternaam: "Bakker", telefoon: "06-34567890", straat: "Dreef", huisnummer: "3", postcode: "1335 GH", plaats: "Almere", email: "anna.bakker@voorbeeld.nl", contactvoorkeur: "email", mobiliteit: [], heeftMk: false, heeftVl: true, noodcontactNaam: "Marieke Bakker", noodcontactTelefoon: "06-33334444" },
  { voornaam: "Els", tussenvoegsel: null, achternaam: "Visser", telefoon: "06-45678901", straat: "Dreef", huisnummer: "5", postcode: "1335 GH", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: ["rolstoel"], heeftMk: true, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Henk", tussenvoegsel: null, achternaam: "Smit", telefoon: "06-56789012", straat: "Laan", huisnummer: "88", postcode: "1321 CD", plaats: "Almere", email: "henk.smit@voorbeeld.nl", contactvoorkeur: "telefoon", mobiliteit: ["hulp bij instappen"], heeftMk: false, heeftVl: false, noodcontactNaam: "Buurtsteun", noodcontactTelefoon: "06-55556666" },
  { voornaam: "Riet", tussenvoegsel: "van den", achternaam: "Berg", telefoon: "06-67890123", straat: "Laan", huisnummer: "90", postcode: "1321 CD", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: ["rollator"], heeftMk: true, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Kees", tussenvoegsel: "de", achternaam: "Boer", telefoon: "06-78901234", straat: "Singel", huisnummer: "7", postcode: "1312 EF", plaats: "Almere", email: "kees.deboer@voorbeeld.nl", contactvoorkeur: "beide", mobiliteit: [], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Truus", tussenvoegsel: null, achternaam: "Mulder", telefoon: "06-89012345", straat: "Singel", huisnummer: "9", postcode: "1312 EF", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: ["rollator"], heeftMk: true, heeftVl: true, noodcontactNaam: "Ans Mulder", noodcontactTelefoon: "06-88889999" },
  { voornaam: "Gerrit", tussenvoegsel: null, achternaam: "Bos", telefoon: "06-90123456", straat: "Weg", huisnummer: "41", postcode: "1317 IJ", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: [], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Annie", tussenvoegsel: null, achternaam: "Dijkstra", telefoon: "06-01234567", straat: "Weg", huisnummer: "43", postcode: "1317 IJ", plaats: "Almere", email: "annie.dijkstra@voorbeeld.nl", contactvoorkeur: "email", mobiliteit: ["hulp bij instappen"], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Willem", tussenvoegsel: null, achternaam: "Vink", telefoon: "06-11223344", straat: "Gracht", huisnummer: "2", postcode: "1311 KL", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: [], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Corrie", tussenvoegsel: null, achternaam: "Kok", telefoon: "06-22334455", straat: "Gracht", huisnummer: "4", postcode: "1311 KL", plaats: "Almere", email: "corrie.kok@voorbeeld.nl", contactvoorkeur: "telefoon", mobiliteit: ["rollator"], heeftMk: true, heeftVl: false, noodcontactNaam: "Sandra Kok", noodcontactTelefoon: "06-22229999" },
  { voornaam: "Bram", tussenvoegsel: null, achternaam: "Vos", telefoon: "06-33445566", straat: "Plein", huisnummer: "18", postcode: "1331 MN", plaats: "Almere", email: null, contactvoorkeur: "telefoon", mobiliteit: [], heeftMk: false, heeftVl: false, noodcontactNaam: null, noodcontactTelefoon: null },
  { voornaam: "Mien", tussenvoegsel: null, achternaam: "Prins", telefoon: "06-44556677", straat: "Plein", huisnummer: "20", postcode: "1331 MN", plaats: "Almere", email: "mien.prins@voorbeeld.nl", contactvoorkeur: "beide", mobiliteit: ["rolstoel"], heeftMk: false, heeftVl: true, noodcontactNaam: null, noodcontactTelefoon: null },
]

export async function seedDatabase(): Promise<void> {
  const bestaand = await een<{ aantal: string }>("select count(*)::text as aantal from gebruikers")
  if (bestaand && Number(bestaand.aantal) > 0) return

  async function maakRol(
    naam: string,
    beschrijving: string,
    zichtbaar: string[],
    volledig = false,
    verwijderbaar: string[] = [],
  ) {
    const rij = await een<{ id: number }>(
      `insert into rollen (naam, beschrijving, rechten, standaard)
       values ($1, $2, $3, true) returning id`,
      [naam, beschrijving, JSON.stringify(rechten(volledig, zichtbaar, verwijderbaar))],
    )
    return rij!.id
  }

  const adminRol = await maakRol("Admin", "Volledige toegang, inclusief modules en accounts.", [], true)
  const beheerderRol = await maakRol("Beheerder", "Beheert deelnemers, programma, accounts en instellingen.", [], true)
  const coordinatorRol = await maakRol(
    "Coördinator",
    "Doet de opgave, de indeling en de reservelijst.",
    ["deelnemers", "groepjes", "programma", "opgave", "indeling", "reservelijst", "vervoer", "feedback", "logboek"],
    false,
    ["opgave", "indeling", "reservelijst", "groepjes"],
  )
  const chauffeurRol = await maakRol(
    "Chauffeur",
    "Ziet eigen uitjes, deelnemerslijsten en doet kosten en kas.",
    ["programma", "declaraties", "kas"],
  )
  const penningmeesterRol = await maakRol(
    "Penningmeester",
    "Controleert en keurt declaraties en kas goed.",
    ["declaraties", "kas", "programma", "logboek"],
  )

  const wachtwoord = hashWachtwoord(DEMO_WACHTWOORD)
  const accounts: { naam: string; email: string; rolId: number }[] = [
    { naam: "Anne de Groot", email: "admin@diligence.nl", rolId: adminRol },
    { naam: "Willem Bakker", email: "beheerder@diligence.nl", rolId: beheerderRol },
    { naam: "Saskia Willems", email: "coordinator@diligence.nl", rolId: coordinatorRol },
    { naam: "Mustafa Yilmaz", email: "chauffeur@diligence.nl", rolId: chauffeurRol },
    { naam: "Dorien Kuiper", email: "penningmeester@diligence.nl", rolId: penningmeesterRol },
  ]
  const gebruikersIds: Record<string, number> = {}
  for (const account of accounts) {
    const rij = await een<{ id: number }>(
      `insert into gebruikers (naam, email, wachtwoord_hash, rol_id)
       values ($1, $2, $3, $4) returning id`,
      [account.naam, account.email, wachtwoord, account.rolId],
    )
    gebruikersIds[account.email] = rij!.id
  }

  await q(
    `insert into instellingen (sleutel, waarde) values
       ('standaard_capaciteit', '14'),
       ('terugkijk_maanden', '12'),
       ('kas_grens', '1000'),
       ('organisatie_naam', 'Stichting Diligence Almere')
     on conflict (sleutel) do nothing`,
  )

  await q(
    `insert into modules (sleutel, naam, uitleg, aan, optioneel, volgorde) values
      ('chauffeurskosten', 'Chauffeurskosten',
       'Chauffeurs leggen hun onkosten per uitje digitaal vast. De penningmeester keurt goed en haalt het maandoverzicht op. Staat de module uit, dan werkt de stichting gewoon met papier.', true, true, 10),
      ('kas', 'Kas',
       'Kasafsluiting per uitje, stortingen en het saldo contant geld op kantoor. Kan alleen aan als Chauffeurskosten aan staat.', false, true, 20),
      ('ai_assistent', 'AI-assistent',
       'Beantwoordt vragen over het programma in gewone taal. De assistent ziet nooit persoonsgegevens. Staat standaard uit.', false, true, 30)
     on conflict (sleutel) do nothing`,
  )

  await q(
    `insert into voertuigen (naam, capaciteit) values
      ('Busje 1', 7), ('Busje 2', 7), ('Touringcar', 40)`,
  )

  const deelnemerIds: number[] = []
  for (const d of DEELNEMERS) {
    const rij = await een<{ id: number }>(
      `insert into deelnemers
        (voornaam, tussenvoegsel, achternaam, telefoon, email, contactvoorkeur, straat, huisnummer,
         postcode, plaats, mobiliteit, heeft_mk, heeft_vl, noodcontact_naam, noodcontact_telefoon)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [
        d.voornaam, d.tussenvoegsel, d.achternaam, d.telefoon, d.email, d.contactvoorkeur,
        d.straat, d.huisnummer, d.postcode, d.plaats, d.mobiliteit, d.heeftMk, d.heeftVl,
        d.noodcontactNaam, d.noodcontactTelefoon,
      ],
    )
    deelnemerIds.push(rij!.id)
  }

  const groep1 = await een<{ id: number }>(
    "insert into groepjes (naam) values ('Jan en Piet') returning id",
  )
  await q("insert into groepje_leden (groepje_id, deelnemer_id) values ($1,$2),($1,$3)", [
    groep1!.id,
    deelnemerIds[0],
    deelnemerIds[1],
  ])
  const groep2 = await een<{ id: number }>(
    "insert into groepjes (naam) values ('De donderdaggroep') returning id",
  )
  await q("insert into groepje_leden (groepje_id, deelnemer_id) values ($1,$2),($1,$3),($1,$4)", [
    groep2!.id,
    deelnemerIds[2],
    deelnemerIds[3],
    deelnemerIds[7],
  ])

  async function maakPeriode(naam: string, start: string, eind: string, deadline: string, status: string) {
    const rij = await een<{ id: number }>(
      `insert into periodes (naam, start_op, eind_op, aanmelddeadline, status)
       values ($1,$2,$3,$4,$5) returning id`,
      [naam, start, eind, deadline, status],
    )
    return rij!.id
  }

  async function maakUitje(
    periodeId: number,
    datum: string,
    begin: string,
    eind: string,
    omschrijving: string,
    prijs: number,
    capaciteit: number,
    labels: string[],
    extraKosten: string | null,
    geschiktheid: string | null,
    reeksId: number | null = null,
  ) {
    const rij = await een<{ id: number }>(
      `insert into uitjes
        (periode_id, reeks_id, datum, begin_tijd, eind_tijd, omschrijving, prijs, capaciteit,
         labels, extra_kosten, geschiktheid)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [periodeId, reeksId, datum, begin, eind, omschrijving, prijs, capaciteit, labels, extraKosten, geschiktheid],
    )
    return rij!.id
  }

  async function voegAanwezigheidToe(uitjeId: number, deelnemerId: number) {
    await q(
      "insert into aanwezigheid (uitje_id, deelnemer_id) values ($1,$2) on conflict do nothing",
      [uitjeId, deelnemerId],
    )
  }

  async function voegOpgaveToe(uitjeId: number, deelnemerId: number) {
    await q(
      `insert into opgaven (uitje_id, deelnemer_id, bron, met_groepje)
       values ($1,$2,'telefoon',true) on conflict do nothing`,
      [uitjeId, deelnemerId],
    )
  }

  const oud = await maakPeriode("juli – augustus 2026", "2026-07-01", "2026-08-31", "2026-06-20", "gesloten")
  const oudUitjes = [
    await maakUitje(oud, "2026-07-14", "09:30", "17:30", "Efteling", 42, 40, ["Uitgelicht"], null, null),
    await maakUitje(oud, "2026-07-28", "10:30", "14:30", "Pannenkoekhuis De Smickel", 12.5, 14, [], "Lunch", null),
    await maakUitje(oud, "2026-08-11", "11:00", "15:00", "Rondvaart Amsterdam", 22, 14, [], "Consumptie", null),
    await maakUitje(oud, "2026-08-25", "10:00", "16:00", "Museum Boijmans Van Beuningen", 18.5, 14, [], null, null),
  ]
  const oudAanwezig: [number, number][] = [
    [0, 0], [1, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0],
    [1, 1], [2, 1], [5, 1], [9, 1], [11, 1],
    [0, 2], [3, 2], [7, 2], [12, 2],
    [4, 3], [6, 3], [8, 3], [13, 3],
  ]
  for (const [deelnemerIndex, uitjeIndex] of oudAanwezig) {
    await voegAanwezigheidToe(oudUitjes[uitjeIndex], deelnemerIds[deelnemerIndex])
  }

  const afgesloten = await maakPeriode(
    "september – oktober 2026",
    "2026-09-01",
    "2026-10-31",
    "2026-09-15",
    "gesloten",
  )
  const afgeslotenUitjes = [
    await maakUitje(afgesloten, "2026-10-06", "10:00", "15:00", "Nationaal Park De Hoge Veluwe", 15, 7, ["Nieuw"], "Koffie", null),
    await maakUitje(afgesloten, "2026-10-13", "13:00", "17:00", "Filmhuis Almere", 12.5, 14, [], null, "Minder geschikt voor rollators"),
    await maakUitje(afgesloten, "2026-10-20", "10:30", "14:30", "Pannenkoekhuis De Smickel", 12.5, 14, ["Op herhaling"], "Lunch", null),
    await maakUitje(afgesloten, "2026-10-27", "09:00", "18:00", "Efteling", 42, 40, ["Op veler verzoek"], null, null),
  ]
  const opgavenAfgesloten: [number, number][] = [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0],
    [0, 1], [2, 1], [5, 1],
    [1, 2], [3, 2], [4, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],
    [0, 3], [2, 3], [6, 3], [8, 3],
  ]
  for (const [deelnemerIndex, uitjeIndex] of opgavenAfgesloten) {
    await voegOpgaveToe(afgeslotenUitjes[uitjeIndex], deelnemerIds[deelnemerIndex])
  }

  const huidig = await maakPeriode(
    "november – december 2026",
    "2026-11-01",
    "2026-12-31",
    "2026-11-09",
    "gepubliceerd",
  )
  const smickelReeks = await een<{ id: number }>(
    "insert into reeksen (periode_id, omschrijving) values ($1, 'Pannenkoekhuis De Smickel') returning id",
    [huidig],
  )
  const huidigUitjes = [
    await maakUitje(huidig, "2026-11-10", "10:30", "14:30", "Pannenkoekhuis De Smickel", 12.5, 14, ["Op herhaling"], "Lunch", null, smickelReeks!.id),
    await maakUitje(huidig, "2026-11-12", "10:30", "14:30", "Pannenkoekhuis De Smickel", 12.5, 14, ["Op herhaling"], "Lunch", null, smickelReeks!.id),
    await maakUitje(huidig, "2026-11-17", "09:00", "18:00", "Efteling", 42, 40, ["Uitgelicht"], null, null),
    await maakUitje(huidig, "2026-11-19", "10:00", "16:00", "Museum Boijmans Van Beuningen", 18.5, 14, ["Nieuw"], null, "Minder geschikt voor rollators"),
    await maakUitje(huidig, "2026-11-24", "11:00", "15:00", "Rondvaart Amsterdam", 22, 14, [], "Consumptie", null),
    await maakUitje(huidig, "2026-12-01", "10:00", "16:00", "Kerstmarkt Dortmund", 15, 14, ["Op veler verzoek"], null, null),
    await maakUitje(huidig, "2026-12-08", "13:00", "17:00", "Filmhuis Almere", 12.5, 14, [], null, "Minder geschikt voor rollators"),
    await maakUitje(huidig, "2026-12-15", "16:00", "20:00", "Uit eten bij De Golfbreker", 25, 14, ["Eenmalig"], "Drankje", null),
    await maakUitje(huidig, "2026-12-22", "11:00", "15:00", "Rondvaart Amsterdam", 22, 14, ["Op herhaling"], "Consumptie", null),
  ]
  const opgavenHuidig: [number, number[]][] = [
    [0, [0, 3]],
    [1, [0, 3]],
    [2, [0, 2]],
    [3, [3, 5]],
    [4, [0, 4]],
    [5, [5]],
    [6, [2, 6]],
    [7, [1, 7]],
    [8, [0, 2, 4]],
    [9, [2, 4]],
    [10, [6]],
    [11, [0, 5]],
    [12, [2]],
  ]
  for (const [deelnemerIndex, uitjeIndices] of opgavenHuidig) {
    for (const uitjeIndex of uitjeIndices) {
      await voegOpgaveToe(huidigUitjes[uitjeIndex], deelnemerIds[deelnemerIndex])
    }
  }

  const chauffeurId = gebruikersIds["chauffeur@diligence.nl"]
  const bus1 = await een<{ id: number }>("select id from voertuigen where naam = 'Busje 1'")
  const touringcar = await een<{ id: number }>("select id from voertuigen where naam = 'Touringcar'")
  await q(
    `insert into uitje_voertuigen (uitje_id, voertuig_id, chauffeur_id) values
       ($1,$2,$3), ($4,$5,$6), ($7,$8,$9)`,
    [
      afgeslotenUitjes[0], bus1!.id, chauffeurId,
      afgeslotenUitjes[3], touringcar!.id, chauffeurId,
      huidigUitjes[2], touringcar!.id, chauffeurId,
    ],
  )

  await q(
    `insert into declaraties (uitje_id, chauffeur_id, bedrag, soort, omschrijving, status)
     values ($1,$2,18.40,'brandstof','Getankt bij vertrek','ingediend'),
            ($3,$2,6.00,'parkeren','Parkeergarage Efteling','goedgekeurd')`,
    [afgeslotenUitjes[0], chauffeurId, afgeslotenUitjes[3]],
  )

  await q(
    `insert into feedback (scherm, tekst, gebruiker_naam, status) values
       ('/opgave', 'Ik mis een knop om iemand meteen te bellen.', 'Saskia Willems', 'nieuw'),
       ('/indeling', 'De uitleg bij de reservelijst is heel duidelijk.', 'Anne de Groot', 'afgehandeld')`,
  )

  await q(
    `insert into email_outbox (deelnemer_id, email, onderwerp, tekst) values
       ($1, 'anna.bakker@voorbeeld.nl', 'Uw opgave is ontvangen',
        'Beste Anna, uw opgave voor de komende periode is ontvangen. U hoort van ons zodra de indeling bekend is.')`,
    [deelnemerIds[2]],
  )
}
