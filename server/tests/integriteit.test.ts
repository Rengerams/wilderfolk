/**
 * Tests voor de autorisatie- en integriteitsregels rond aanwezigheid,
 * import-rollback, declaraties, kasafsluitingen en voertuigtoewijzing.
 *
 * Net als de deelnemerstests draaien ze tegen een eigen tijdelijke database
 * (diligence_test_integriteit), zodat de ontwikkeldatabase ongemoeid blijft.
 * Na afloop wordt die database weggegooid.
 *
 * Draaien: `npm test` (in de api-container).
 */
import assert from "node:assert/strict"
import { once } from "node:events"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, describe, it } from "node:test"
import express from "express"
import pg from "pg"
import type { Gebruiker } from "../src/auth"

const TEST_DATABASE = "diligence_test_integriteit"
const basisUrl = process.env.DATABASE_URL
if (!basisUrl) {
  throw new Error("DATABASE_URL ontbreekt. Draai de tests in de api-container: docker compose exec api npm test")
}
const databaseUrl: string = basisUrl

let server: Server | undefined
let poort: number
let db: typeof import("../src/db")
// Pas na het zetten van DATABASE_URL laden, anders praat de test met de ontwikkeldatabase.
let hashWachtwoord: (wachtwoord: string) => string

let beheerder: Gebruiker
let penningmeester: Gebruiker
let chauffeur: Gebruiker
let planner: Gebruiker
const gebruikers = new Map<number, Gebruiker>()
let chauffeurId = 0
let penningmeesterId = 0
let beheerderId = 0
let plannerId = 0
let vrijwilligerId = 0

async function beheerVerbinding(): Promise<pg.Client> {
  const url = new URL(databaseUrl)
  url.pathname = "/postgres"
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  return client
}

async function maakGebruiker(naam: string, rolId: number, rolNaam: string): Promise<Gebruiker> {
  const rij = await db.een<{ id: number }>(
    `insert into gebruikers (naam, email, wachtwoord_hash, rol_id)
     values ($1,$2,'niet-gebruikt',$3)
     on conflict (email) do update set naam = excluded.naam, rol_id = excluded.rol_id returning id`,
    [naam, `${naam.toLowerCase().replace(/\s+/g, ".")}@test.nl`, rolId],
  )
  return {
    id: rij!.id,
    naam,
    email: `${naam.toLowerCase().replace(/\s+/g, ".")}@test.nl`,
    rol_id: rolId,
    rol_naam: rolNaam,
    rechten: {},
    actief: true,
    twee_staps: false,
  }
}

before(async () => {
  const beheer = await beheerVerbinding()
  await beheer.query(`drop database if exists ${TEST_DATABASE} with (force)`)
  await beheer.query(`create database ${TEST_DATABASE}`)
  await beheer.end()

  const testUrl = new URL(databaseUrl)
  testUrl.pathname = `/${TEST_DATABASE}`
  process.env.DATABASE_URL = testUrl.toString()

  db = await import("../src/db")
  hashWachtwoord = (await import("../src/auth")).hashWachtwoord
  const { SCHEMA_SQL } = await import("../src/schema")
  const { programmaRouter } = await import("../src/routes/programma")
  const { opgaveRouter } = await import("../src/routes/opgave")
  const { geldRouter } = await import("../src/routes/geld")
  const { authRouter } = await import("../src/routes/auth")
  const { beheerRouter } = await import("../src/routes/beheer")

  await db.q(SCHEMA_SQL)
  await db.q(
    `insert into modules (sleutel, naam, uitleg, aan) values
       ('chauffeurskosten','Chauffeurskosten','Kosten van chauffeurs',true),
       ('kas','Kas','Kasafsluitingen',true)
     on conflict do nothing`,
  )

  // Twee gelijktijdige testruns delen dezelfde testdatabase; een bestaande rol
  // mag daarom geen dubbele-sleutelfout opleveren.
  async function maakRol(naam: string): Promise<{ id: number }> {
    return (await db.een<{ id: number }>(
      `insert into rollen (naam, beschrijving, rechten) values ($1,'test','{}'::jsonb)
       on conflict (naam) do update set beschrijving = excluded.beschrijving returning id`,
      [naam],
    ))!
  }

  const rolBeheerder = await maakRol("Beheerder")
  const rolPenningmeester = await maakRol("Penningmeester")
  const rolChauffeur = await maakRol("Chauffeur")
  const rolCoordinator = await maakRol("Coördinator")
  const rolVrijwilliger = await maakRol("Vrijwilliger")

  beheerder = await maakGebruiker("Beheerder Test", rolBeheerder!.id, "Beheerder")
  penningmeester = await maakGebruiker("Penning Test", rolPenningmeester!.id, "Penningmeester")
  chauffeur = await maakGebruiker("Chauffeur Test", rolChauffeur!.id, "Chauffeur")
  planner = await maakGebruiker("Planner Test", rolCoordinator!.id, "Coördinator")
  const vrijwilliger = await maakGebruiker("Vrijwilliger Test", rolVrijwilliger!.id, "Vrijwilliger")
  vrijwilligerId = vrijwilliger.id
  gebruikers.set(vrijwilliger.id, vrijwilliger)

  beheerderId = beheerder.id
  penningmeesterId = penningmeester.id
  chauffeurId = chauffeur.id
  plannerId = planner.id
  for (const gebruiker of [beheerder, penningmeester, chauffeur, planner]) {
    gebruikers.set(gebruiker.id, gebruiker)
  }
  beheerder.rechten = { rollen: { aanmaken: true, wijzigen: true } }

  const app = express()
  app.use(express.json())
  // De tests kiezen zelf welke medewerker het verzoek doet.
  app.use((req, _res, next) => {
    const gekozen = Number(req.headers["x-als"])
    req.gebruiker = gebruikers.get(gekozen) ?? beheerder
    next()
  })
  app.use("/api/periodes", programmaRouter)
  app.use("/api/opgave", opgaveRouter)
  app.use("/api/declaraties", geldRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/beheer", beheerRouter)

  server = app.listen(0, "127.0.0.1")
  await once(server, "listening")
  poort = (server.address() as AddressInfo).port
})

after(async () => {
  if (server) await new Promise<void>((klaar) => server!.close(() => klaar()))
  try {
    await db?.sluitDb()
  } finally {
    const beheer = await beheerVerbinding()
    await beheer.query(`drop database if exists ${TEST_DATABASE} with (force)`)
    await beheer.end()
  }
})

async function verzoek(
  pad: string,
  opties: RequestInit & { als?: number } = {},
): Promise<{ status: number; data: Record<string, unknown>; tekst: string }> {
  const { als, ...rest } = opties
  const antwoord = await fetch(`http://127.0.0.1:${poort}${pad}`, {
    headers: { "Content-Type": "application/json", "x-als": String(als ?? beheerderId) },
    ...rest,
  })
  const tekst = await antwoord.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(tekst) as Record<string, unknown>
  } catch {
    data = {}
  }
  return { status: antwoord.status, data, tekst }
}

async function maakPeriode(): Promise<{ id: number }> {
  return (await db.een<{ id: number }>(
    `insert into periodes (naam, start_op, eind_op, aanmelddeadline, status)
     values ('Testperiode', '2026-11-01', '2026-12-31', '2026-11-01', 'gepubliceerd') returning id`,
  ))!
}

async function maakUitje(periodeId: number, datum = "2026-11-10") {
  return (await db.een<{ id: number }>(
    `insert into uitjes (periode_id, datum, begin_tijd, eind_tijd, omschrijving, capaciteit)
     values ($1,$2,'10:00','14:00','Testuitje',$3) returning id`,
    [periodeId, datum, 10],
  ))!
}

async function maakDeelnemer(naam: string): Promise<{ id: number }> {
  return (await db.een<{ id: number }>(
    `insert into deelnemers (voornaam, achternaam, status) values ($1,'Test','actief') returning id`,
    [naam],
  ))!
}

describe("aanwezigheid", () => {
  it("weigert deelnemers die niet voor het uitje zijn aangemeld", async () => {
    const periode = await maakPeriode()
    const uitje = await maakUitje(periode.id)
    const aangemeld = await maakDeelnemer("Aangemeld")
    const vreemde = await maakDeelnemer("Vreemde")
    await db.q("insert into opgaven (uitje_id, deelnemer_id) values ($1,$2)", [uitje.id, aangemeld.id])

    const fout = await verzoek(`/api/periodes/uitje/${uitje.id}/afronden`, {
      method: "POST",
      body: JSON.stringify({ aanwezig: [vreemde.id] }),
    })
    assert.equal(fout.status, 400, JSON.stringify(fout.data))
    assert.equal((await db.q("select 1 from aanwezigheid where uitje_id = $1", [uitje.id])).length, 0)

    const leeg = await verzoek(`/api/periodes/uitje/${uitje.id}/afronden`, {
      method: "POST",
      body: JSON.stringify({ aanwezig: [] }),
    })
    assert.equal(leeg.status, 400, JSON.stringify(leeg.data))

    const goed = await verzoek(`/api/periodes/uitje/${uitje.id}/afronden`, {
      method: "POST",
      body: JSON.stringify({ aanwezig: [aangemeld.id] }),
    })
    assert.equal(goed.status, 200, JSON.stringify(goed.data))
    const rijen = await db.q<{ deelnemer_id: number }>(
      "select deelnemer_id from aanwezigheid where uitje_id = $1",
      [uitje.id],
    )
    assert.deepEqual(rijen.map((rij) => rij.deelnemer_id), [aangemeld.id])
  })
})

describe("import ongedaan maken", () => {
  async function maakImport(makerId: number, metOpgave = false) {
    const periode = await maakPeriode()
    const uitje = await maakUitje(periode.id, "2026-12-01")
    const batch = await db.een<{ id: number }>(
      `insert into import_batches (periode_id, soort, aantal, door) values ($1,'programma',1,$2) returning id`,
      [periode.id, makerId],
    )
    await db.q("insert into import_batch_uitjes (batch_id, uitje_id) values ($1,$2)", [
      batch!.id,
      uitje.id,
    ])
    if (metOpgave) {
      const deelnemer = await maakDeelnemer("Deelnemer import")
      await db.q("insert into opgaven (uitje_id, deelnemer_id) values ($1,$2)", [uitje.id, deelnemer.id])
    }
    return { batch: batch!, uitje }
  }

  it("laat een andere planner niet andermans import verwijderen", async () => {
    const { batch, uitje } = await maakImport(beheerderId)
    const antwoord = await verzoek(`/api/periodes/import/${batch.id}/ongedaan`, {
      method: "POST",
      als: plannerId,
    })
    assert.equal(antwoord.status, 403, JSON.stringify(antwoord.data))
    assert.equal((await db.q("select 1 from uitjes where id = $1", [uitje.id])).length, 1)
  })

  it("weigert rollback als er al opgaven op de import staan", async () => {
    const { batch } = await maakImport(beheerderId, true)
    const antwoord = await verzoek(`/api/periodes/import/${batch.id}/ongedaan`, { method: "POST" })
    assert.equal(antwoord.status, 409, JSON.stringify(antwoord.data))
  })

  it("verwijdert de import van de maker in één keer", async () => {
    const { batch, uitje } = await maakImport(beheerderId)
    const antwoord = await verzoek(`/api/periodes/import/${batch.id}/ongedaan`, { method: "POST" })
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data))
    assert.equal((await db.q("select 1 from uitjes where id = $1", [uitje.id])).length, 0)
    assert.equal((await db.q("select 1 from import_batches where id = $1", [batch.id])).length, 0)
  })
})

describe("declaraties", () => {
  async function maakDeclaratie(bedrag = 25, omschrijving = "Parkeren") {
    const periode = await maakPeriode()
    const uitje = await maakUitje(periode.id)
    const rij = await db.een<{ id: number }>(
      `insert into declaraties (uitje_id, chauffeur_id, bedrag, soort, omschrijving, status)
       values ($1,$2,$3,'parkeren',$4,'ingediend') returning id`,
      [uitje.id, chauffeurId, bedrag, omschrijving],
    )
    return { id: rij!.id, uitjeId: uitje.id }
  }

  it("keurt één keer goed en betaalt één keer uit", async () => {
    const { id } = await maakDeclaratie()
    const eerste = await verzoek(`/api/declaraties/${id}/beoordelen`, {
      method: "POST",
      als: penningmeesterId,
      body: JSON.stringify({ goedkeuren: true }),
    })
    assert.equal(eerste.status, 200, JSON.stringify(eerste.data))

    const tweede = await verzoek(`/api/declaraties/${id}/beoordelen`, {
      method: "POST",
      als: penningmeesterId,
      body: JSON.stringify({ goedkeuren: true }),
    })
    assert.equal(tweede.status, 409, JSON.stringify(tweede.data))

    const betalen = await verzoek(`/api/declaraties/${id}/uitbetalen`, {
      method: "POST",
      als: penningmeesterId,
    })
    assert.equal(betalen.status, 200, JSON.stringify(betalen.data))

    const nogmaals = await verzoek(`/api/declaraties/${id}/uitbetalen`, {
      method: "POST",
      als: penningmeesterId,
    })
    assert.equal(nogmaals.status, 409, JSON.stringify(nogmaals.data))
  })

  it("verbiedt het beoordelen van je eigen declaratie", async () => {
    const periode = await maakPeriode()
    const uitje = await maakUitje(periode.id)
    const eigen = await db.een<{ id: number }>(
      `insert into declaraties (uitje_id, chauffeur_id, bedrag, soort, status)
       values ($1,$2,10,'overig','ingediend') returning id`,
      [uitje.id, penningmeesterId],
    )
    const antwoord = await verzoek(`/api/declaraties/${eigen!.id}/beoordelen`, {
      method: "POST",
      als: penningmeesterId,
      body: JSON.stringify({ goedkeuren: true }),
    })
    assert.equal(antwoord.status, 403, JSON.stringify(antwoord.data))
  })

  it("beschermt de CSV-export tegen formules", async () => {
    await maakDeclaratie(5, "=2+2")
    const antwoord = await verzoek("/api/declaraties/export", { als: penningmeesterId })
    assert.equal(antwoord.status, 200)
    assert.ok(antwoord.tekst.includes(`"'=2+2"`), antwoord.tekst)
  })
})

describe("kasafsluiting", () => {
  it("weigert een tweede afsluiting en negatieve bedragen", async () => {
    const periode = await maakPeriode()
    const uitje = await maakUitje(periode.id)
    const eerste = await verzoek("/api/declaraties/kas/afsluiting", {
      method: "POST",
      body: JSON.stringify({ uitje_id: uitje.id, verwacht: 100, geteld: 95 }),
    })
    assert.equal(eerste.status, 201, JSON.stringify(eerste.data))

    const tweede = await verzoek("/api/declaraties/kas/afsluiting", {
      method: "POST",
      body: JSON.stringify({ uitje_id: uitje.id, verwacht: 50, geteld: 50 }),
    })
    assert.equal(tweede.status, 409, JSON.stringify(tweede.data))

    const anderUitje = await maakUitje(periode.id, "2026-11-11")
    const negatief = await verzoek("/api/declaraties/kas/afsluiting", {
      method: "POST",
      body: JSON.stringify({ uitje_id: anderUitje.id, verwacht: -5, geteld: 10 }),
    })
    assert.equal(negatief.status, 400, JSON.stringify(negatief.data))
  })
})

describe("voertuigtoewijzing", () => {
  it("weigert een chauffeur die al op deze dag rijdt en een ongeldige rol", async () => {
    const periode = await maakPeriode()
    const eersteUitje = await maakUitje(periode.id)
    const tweedeUitje = await maakUitje(periode.id, "2026-11-10")
    const voertuig = await db.een<{ id: number }>(
      `insert into voertuigen (naam, capaciteit, kenteken) values ('Testbus',8,'AA-11-BB') returning id`,
    )
    const tweedeVoertuig = await db.een<{ id: number }>(
      `insert into voertuigen (naam, capaciteit, kenteken) values ('Tweede bus',6,'CC-22-DD') returning id`,
    )

    const eerste = await verzoek(`/api/periodes/uitje/${eersteUitje.id}/voertuigen`, {
      method: "POST",
      body: JSON.stringify({ voertuig_id: voertuig!.id, chauffeur_id: chauffeurId }),
    })
    assert.equal(eerste.status, 200, JSON.stringify(eerste.data))

    const conflict = await verzoek(`/api/periodes/uitje/${tweedeUitje.id}/voertuigen`, {
      method: "POST",
      body: JSON.stringify({ voertuig_id: tweedeVoertuig!.id, chauffeur_id: chauffeurId }),
    })
    assert.equal(conflict.status, 409, JSON.stringify(conflict.data))

    const verkeerdeRol = await verzoek(`/api/periodes/uitje/${tweedeUitje.id}/voertuigen`, {
      method: "POST",
      body: JSON.stringify({ voertuig_id: tweedeVoertuig!.id, chauffeur_id: vrijwilligerId }),
    })
    assert.equal(verkeerdeRol.status, 400, JSON.stringify(verkeerdeRol.data))
  })
})

describe("inlog- en herstelcodes", () => {
  async function maakInlogbaarAccount(email: string): Promise<number> {
    const rol = await db.een<{ id: number }>("select id from rollen where naam = 'Chauffeur'")
    const gebruiker = await db.een<{ id: number }>(
      `insert into gebruikers (naam, email, wachtwoord_hash, rol_id, twee_staps)
       values ('Code Test',$1,$2,$3,true) returning id`,
      [email, hashWachtwoord("goed-wachtwoord-123"), rol!.id],
    )
    gebruikers.set(gebruiker!.id, {
      ...chauffeur,
      id: gebruiker!.id,
      naam: "Code Test",
      email,
      twee_staps: true,
    })
    return gebruiker!.id
  }

  it("bewaart de 2FA-code gehasht en gebruikt hem één keer", async () => {
    const id = await maakInlogbaarAccount("tweestaps@test.nl")
    const login = await verzoek("/api/auth/login", {
      method: "POST",
      als: id,
      body: JSON.stringify({ email: "tweestaps@test.nl", wachtwoord: "goed-wachtwoord-123" }),
    })
    assert.equal(login.status, 200, JSON.stringify(login.data))
    assert.equal(login.data.twee_staps, true)
    const code = String(login.data.code)
    assert.match(code, /^\d{6}$/)

    const opgeslagen = await db.een<{ twee_staps_code: string }>(
      "select twee_staps_code from gebruikers where id = $1",
      [id],
    )
    assert.ok(opgeslagen!.twee_staps_code.startsWith("scrypt$"), "de code hoort gehasht te staan")
    assert.notEqual(opgeslagen!.twee_staps_code, code)

    const stap = await verzoek("/api/auth/twee-staps", {
      method: "POST",
      als: id,
      body: JSON.stringify({ email: "tweestaps@test.nl", code }),
    })
    assert.equal(stap.status, 200, JSON.stringify(stap.data))

    const hergebruik = await verzoek("/api/auth/twee-staps", {
      method: "POST",
      als: id,
      body: JSON.stringify({ email: "tweestaps@test.nl", code }),
    })
    assert.equal(hergebruik.status, 401, JSON.stringify(hergebruik.data))
  })

  it("bewaart de herstelcode gehasht en wisselt het wachtwoord", async () => {
    const id = await maakInlogbaarAccount("herstel@test.nl")
    const vraag = await verzoek("/api/auth/wachtwoord-vergeten", {
      method: "POST",
      als: id,
      body: JSON.stringify({ email: "herstel@test.nl" }),
    })
    assert.equal(vraag.status, 200, JSON.stringify(vraag.data))
    const code = String(vraag.data.code)
    const opgeslagen = await db.een<{ reset_code: string }>(
      "select reset_code from gebruikers where id = $1",
      [id],
    )
    assert.ok(opgeslagen!.reset_code.startsWith("scrypt$"), "de herstelcode hoort gehasht te staan")

    const herstel = await verzoek("/api/auth/wachtwoord-herstellen", {
      method: "POST",
      als: id,
      body: JSON.stringify({
        email: "herstel@test.nl",
        code,
        nieuw_wachtwoord: "nieuw-wachtwoord-456",
      }),
    })
    assert.equal(herstel.status, 200, JSON.stringify(herstel.data))

    const login = await verzoek("/api/auth/login", {
      method: "POST",
      als: id,
      body: JSON.stringify({ email: "herstel@test.nl", wachtwoord: "nieuw-wachtwoord-456" }),
    })
    assert.equal(login.status, 200, JSON.stringify(login.data))
  })
})

describe("rollen", () => {
  it("weigert een tweede rol met dezelfde naam zonder databankfout", async () => {
    const eerste = await verzoek("/api/beheer/rollen", {
      method: "POST",
      body: JSON.stringify({ naam: "Dubbele rol" }),
    })
    assert.equal(eerste.status, 201, JSON.stringify(eerste.data))

    const tweede = await verzoek("/api/beheer/rollen", {
      method: "POST",
      body: JSON.stringify({ naam: "dubbele rol" }),
    })
    assert.equal(tweede.status, 409, JSON.stringify(tweede.data))
    assert.equal(tweede.data.fout, "Er bestaat al een rol met deze naam.")

    const aantal = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from rollen where lower(naam) = 'dubbele rol'",
    )
    assert.equal(aantal!.aantal, "1")
  })
})

describe("invoervalidatie programma en opgave", () => {
  it("weigert een handmatig uitje buiten de periode, met een onbestaande datum of met omgekeerde tijden", async () => {
    const periode = await maakPeriode()

    const buiten = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Buiten de periode", datums: ["2026-10-15"] }),
    })
    assert.equal(buiten.status, 400, JSON.stringify(buiten.data))

    const onbestaand = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Geen echte datum", datums: ["2026-11-31"] }),
    })
    assert.equal(onbestaand.status, 400, JSON.stringify(onbestaand.data))

    const omgekeerdeTijd = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({
        omschrijving: "Omgekeerde tijd",
        datums: ["2026-11-12"],
        begin_tijd: "14:00",
        eind_tijd: "10:00",
      }),
    })
    assert.equal(omgekeerdeTijd.status, 400, JSON.stringify(omgekeerdeTijd.data))

    const aantal = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from uitjes where periode_id = $1",
      [periode.id],
    )
    assert.equal(aantal!.aantal, "0")
  })

  it("weigert handmatige prijs en capaciteit buiten dezelfde grenzen als de import", async () => {
    const periode = await maakPeriode()

    const teDuur = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Te duur", datums: ["2026-11-12"], prijs: 5001 }),
    })
    assert.equal(teDuur.status, 400, JSON.stringify(teDuur.data))

    const negatievePrijs = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Negatieve prijs", datums: ["2026-11-12"], prijs: -1 }),
    })
    assert.equal(negatievePrijs.status, 400, JSON.stringify(negatievePrijs.data))

    const teGroteCapaciteit = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Te veel plekken", datums: ["2026-11-12"], capaciteit: 201 }),
    })
    assert.equal(teGroteCapaciteit.status, 400, JSON.stringify(teGroteCapaciteit.data))

    const geenCapaciteit = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Geen plekken", datums: ["2026-11-12"], capaciteit: 0 }),
    })
    assert.equal(geenCapaciteit.status, 400, JSON.stringify(geenCapaciteit.data))

    const halveCapaciteit = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({ omschrijving: "Halve plek", datums: ["2026-11-12"], capaciteit: 10.5 }),
    })
    assert.equal(halveCapaciteit.status, 400, JSON.stringify(halveCapaciteit.data))

    const aantal = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from uitjes where periode_id = $1",
      [periode.id],
    )
    assert.equal(aantal!.aantal, "0")

    const andere = await maakPeriode()
    const bestaand = await maakUitje(andere.id, "2026-11-20")
    const teDuurBewerken = await verzoek(`/api/periodes/uitje/${bestaand.id}`, {
      method: "PATCH",
      body: JSON.stringify({ prijs: 6000 }),
    })
    assert.equal(teDuurBewerken.status, 400, JSON.stringify(teDuurBewerken.data))
    const teGrootBewerken = await verzoek(`/api/periodes/uitje/${bestaand.id}`, {
      method: "PATCH",
      body: JSON.stringify({ capaciteit: 201 }),
    })
    assert.equal(teGrootBewerken.status, 400, JSON.stringify(teGrootBewerken.data))
    const ongewijzigd = await db.een<{ prijs: number; capaciteit: number }>(
      "select prijs, capaciteit from uitjes where id = $1",
      [bestaand.id],
    )
    assert.equal(ongewijzigd!.prijs, 0)
    assert.equal(ongewijzigd!.capaciteit, 10)
  })

  it("weigert dezelfde datum twee keer in één reeks", async () => {
    const periode = await maakPeriode()

    const antwoord = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
      method: "POST",
      body: JSON.stringify({
        omschrijving: "Dubbele datum",
        datums: ["2026-11-12", "2026-11-12"],
      }),
    })
    assert.equal(antwoord.status, 400, JSON.stringify(antwoord.data))

    const aantal = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from uitjes where periode_id = $1",
      [periode.id],
    )
    assert.equal(aantal!.aantal, "0")
    const reeksen = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from reeksen where periode_id = $1",
      [periode.id],
    )
    assert.equal(reeksen!.aantal, "0")
  })

  it("draait een handmatige reeks terug als er halverwege een fout optreedt", async () => {
    const periode = await maakPeriode()
    await db.q(
      `insert into uitjes (periode_id, datum, omschrijving, capaciteit)
       values ($1,'2026-11-15','Reeks met fout',10)`,
      [periode.id],
    )
    await db.q(
      `create unique index test_reeks_uniek on uitjes (datum, omschrijving)
        where periode_id = ${periode.id}`,
    )
    try {
      const antwoord = await verzoek(`/api/periodes/${periode.id}/uitjes`, {
        method: "POST",
        body: JSON.stringify({
          omschrijving: "Reeks met fout",
          datums: ["2026-11-14", "2026-11-15"],
        }),
      })
      assert.ok(antwoord.status >= 400, JSON.stringify(antwoord.data))
    } finally {
      await db.q("drop index if exists test_reeks_uniek")
    }

    const uitjes = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from uitjes where periode_id = $1",
      [periode.id],
    )
    assert.equal(uitjes!.aantal, "1", "alleen het bestaande uitje hoort over te blijven")
    const reeksen = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from reeksen where periode_id = $1",
      [periode.id],
    )
    assert.equal(reeksen!.aantal, "0")
  })

  it("weigert een periode met een deadline na de einddatum", async () => {
    const antwoord = await verzoek("/api/periodes", {
      method: "POST",
      body: JSON.stringify({
        start_op: "2027-01-01",
        eind_op: "2027-01-31",
        aanmelddeadline: "2027-02-15",
      }),
    })
    assert.equal(antwoord.status, 400, JSON.stringify(antwoord.data))
  })

  it("weigert een opgave die uitjes uit twee periodes mengt", async () => {
    const eerste = await maakPeriode()
    const tweede = await maakPeriode()
    const uitjeEen = await maakUitje(eerste.id, "2026-11-10")
    const uitjeTwee = await maakUitje(tweede.id, "2026-12-10")
    const deelnemer = await maakDeelnemer("Mengelaar")

    const antwoord = await verzoek("/api/opgave", {
      method: "POST",
      body: JSON.stringify({ deelnemer_id: deelnemer.id, uitje_ids: [uitjeEen.id, uitjeTwee.id] }),
    })
    assert.equal(antwoord.status, 400, JSON.stringify(antwoord.data))
    const opgaven = await db.een<{ aantal: string }>(
      "select count(*)::text as aantal from opgaven where deelnemer_id = $1",
      [deelnemer.id],
    )
    assert.equal(opgaven!.aantal, "0")
  })

  it("weigert een opgave voor een uitje dat niet bestaat", async () => {
    const deelnemer = await maakDeelnemer("Onbekend uitje")
    const antwoord = await verzoek("/api/opgave", {
      method: "POST",
      body: JSON.stringify({ deelnemer_id: deelnemer.id, uitje_ids: [999_999] }),
    })
    assert.equal(antwoord.status, 400, JSON.stringify(antwoord.data))
  })

  it("zet eerste_opgave ook bij een deelnemer zonder groepje", async () => {
    const periode = (await db.een<{ id: number }>(
      `insert into periodes (naam, start_op, eind_op, aanmelddeadline, status)
       values ('Open periode','2026-11-01','2027-12-31','2027-06-30','gepubliceerd') returning id`,
    ))!
    const uitje = await maakUitje(periode.id, "2026-11-20")
    const deelnemer = await maakDeelnemer("Zonder groep")

    const antwoord = await verzoek("/api/opgave", {
      method: "POST",
      body: JSON.stringify({ deelnemer_id: deelnemer.id, uitje_ids: [uitje.id], met_groepje: false }),
    })
    assert.equal(antwoord.status, 201, JSON.stringify(antwoord.data))

    const rij = await db.een<{ eerste_opgave: string | null }>(
      "select eerste_opgave from deelnemers where id = $1",
      [deelnemer.id],
    )
    assert.ok(rij?.eerste_opgave, "eerste_opgave moet gevuld zijn")
  })

  it("draait een import terug als er halverwege een fout optreedt", async () => {
    const periode = await maakPeriode()
    const tel = async (sql: string) =>
      (await db.een<{ aantal: string }>(sql, [periode.id]))!.aantal
    const voor = await tel("select count(*)::text as aantal from uitjes where periode_id = $1")

    await db.q(
      `create unique index test_import_uniek on uitjes (datum, omschrijving)
        where periode_id = ${periode.id}`,
    )
    try {
      const regel = {
        rij: 1,
        datum: "2026-11-12",
        begin_tijd: "10:00",
        eind_tijd: "12:00",
        omschrijving: "Dubbele regel",
        prijs: 0,
        capaciteit: 10,
        labels: [],
        reeks_sleutel: "dubbele regel",
      }
      const antwoord = await verzoek(`/api/periodes/${periode.id}/import/bevestig`, {
        method: "POST",
        body: JSON.stringify({ regels: [regel, { ...regel, rij: 2 }] }),
      })
      assert.ok(antwoord.status >= 400, JSON.stringify(antwoord.data))
    } finally {
      await db.q("drop index if exists test_import_uniek")
    }

    assert.equal(await tel("select count(*)::text as aantal from uitjes where periode_id = $1"), voor)
    assert.equal(
      await tel("select count(*)::text as aantal from import_batches where periode_id = $1"),
      "0",
    )
    assert.equal(
      await tel(
        `select count(*)::text as aantal from reeksen where periode_id = $1
          and omschrijving = 'Dubbele regel'`,
      ),
      "0",
    )
  })
})
