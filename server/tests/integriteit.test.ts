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
