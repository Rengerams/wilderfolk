/**
 * Tests voor het deelnemersmodel: worden mobiliteitskenmerken, contactgegevens
 * en de kaartstatus (MK/VL) goed opgeslagen en weer opgehaald?
 *
 * De tests draaien tegen een eigen, tijdelijke database (diligence_test) zodat de
 * ontwikkeldatabase met rust blijft. Ze gebruiken de echte routes en de echte
 * SQL, en controleren daarna ook de rij in de database zelf. Na afloop wordt de
 * hele testdatabase weggegooid; er blijven dus geen testgegevens of logregels achter.
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

const TEST_DATABASE = "diligence_test"
const basisUrl = process.env.DATABASE_URL
if (!basisUrl) {
  throw new Error("DATABASE_URL ontbreekt. Draai de tests in de api-container: docker compose exec api npm test")
}
const databaseUrl: string = basisUrl

let server: Server | undefined
let poort: number
let db: typeof import("../src/db")
let beheerder: Gebruiker

async function beheerVerbinding(): Promise<pg.Client> {
  const url = new URL(databaseUrl)
  url.pathname = "/postgres"
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  return client
}

before(async () => {
  // Schone testdatabase, zodat de tests nooit in de ontwikkeldatabase schrijven.
  const beheer = await beheerVerbinding()
  await beheer.query(`drop database if exists ${TEST_DATABASE} with (force)`)
  await beheer.query(`create database ${TEST_DATABASE}`)
  await beheer.end()

  const testUrl = new URL(databaseUrl)
  testUrl.pathname = `/${TEST_DATABASE}`
  process.env.DATABASE_URL = testUrl.toString()

  // Pas hierna importeren: db.ts leest DATABASE_URL bij het laden.
  db = await import("../src/db")
  const { SCHEMA_SQL } = await import("../src/schema")
  const { deelnemersRouter } = await import("../src/routes/deelnemers")

  await db.q(SCHEMA_SQL)

  const rol = await db.een<{ id: number }>(
    `insert into rollen (naam, beschrijving, rechten)
     values ('Testbeheerder', 'Alleen voor de tests', '{"deelnemers":{"zien":true,"aanmaken":true,"wijzigen":true,"verwijderen":true}}'::jsonb)
     on conflict (naam) do update set beschrijving = excluded.beschrijving
     returning id`,
  )
  const gebruiker = await db.een<{ id: number }>(
    `insert into gebruikers (naam, email, wachtwoord_hash, rol_id)
     values ('Test Medewerker', 'test@diligence.nl', 'niet-gebruikt', $1)
     on conflict (email) do update set rol_id = excluded.rol_id
     returning id`,
    [rol!.id],
  )
  beheerder = {
    id: gebruiker!.id,
    naam: "Test Medewerker",
    email: "test@diligence.nl",
    rol_id: rol!.id,
    rol_naam: "Testbeheerder",
    rechten: { deelnemers: { zien: true, aanmaken: true, wijzigen: true, verwijderen: true } },
    actief: true,
    twee_staps: false,
  }

  // De echte deelnemersroutes, zonder inlogsessie: de tests werken als de
  // testmedewerker, zodat het wijzigingsoverzicht blijft werken.
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.gebruiker = beheerder
    next()
  })
  app.use("/api/deelnemers", deelnemersRouter)

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

type Deelnemer = {
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
}

async function verzoek(pad: string, opties: RequestInit = {}) {
  const antwoord = await fetch(`http://127.0.0.1:${poort}/api/deelnemers${pad}`, {
    headers: { "Content-Type": "application/json" },
    ...opties,
  })
  const data = (await antwoord.json().catch(() => ({}))) as Record<string, unknown>
  return { status: antwoord.status, data }
}

let volgnummer = 0

/** Unieke namen, zodat de dubbele-deelnemercontrole de tests niet in de weg zit. */
function nieuweDeelnemer(velden: Partial<Deelnemer> = {}) {
  volgnummer += 1
  return {
    voornaam: ["Anna", "Bram", "Cora", "Dirk", "Els"][volgnummer % 5],
    tussenvoegsel: "de",
    achternaam: `Testpersoon${volgnummer}`,
    telefoon: `06-${String(10000000 + volgnummer)}`,
    negeer_duplicaat: true,
    ...velden,
  }
}

async function maakDeelnemer(velden: Partial<Deelnemer> = {}): Promise<Deelnemer> {
  const antwoord = await verzoek("", { method: "POST", body: JSON.stringify(nieuweDeelnemer(velden)) })
  assert.equal(antwoord.status, 201, JSON.stringify(antwoord.data))
  return (antwoord.data as { deelnemer: Deelnemer }).deelnemer
}

async function leesDeelnemer(id: number): Promise<Deelnemer> {
  const antwoord = await verzoek(`/${id}`)
  assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data))
  return (antwoord.data as { deelnemer: Deelnemer }).deelnemer
}

async function rijInDatabase(id: number): Promise<Deelnemer> {
  const [rij] = await db.q<Deelnemer>("select * from deelnemers where id = $1", [id])
  assert.ok(rij, `deelnemer ${id} hoort in de database te staan`)
  return rij
}

describe("deelnemersmodel", () => {
  it("bewaart mobiliteitskenmerken en haalt ze terug", async () => {
    const deelnemer = await maakDeelnemer({ mobiliteit: ["rollator", "rolstoel"] })

    assert.deepEqual(deelnemer.mobiliteit, ["rollator", "rolstoel"])

    const opgehaald = await leesDeelnemer(deelnemer.id)
    assert.deepEqual(opgehaald.mobiliteit, ["rollator", "rolstoel"])

    const rij = await rijInDatabase(deelnemer.id)
    assert.deepEqual(rij.mobiliteit, ["rollator", "rolstoel"])
  })

  it("bewaart contactgegevens en adres en haalt ze terug", async () => {
    const invoer = {
      telefoon: "06-12345678",
      telefoon_alt: "020-7654321",
      email: "anna@voorbeeld.nl",
      contactvoorkeur: "beide",
      straat: "Testlaan",
      huisnummer: "7a",
      postcode: "1315 AB",
      plaats: "Almere",
      opmerkingen: "Bel graag na 10 uur.",
    }
    const deelnemer = await maakDeelnemer(invoer)

    for (const [veld, waarde] of Object.entries(invoer)) {
      assert.equal(deelnemer[veld as keyof Deelnemer], waarde, `na aanmaken: ${veld}`)
    }

    const opgehaald = await leesDeelnemer(deelnemer.id)
    for (const [veld, waarde] of Object.entries(invoer)) {
      assert.equal(opgehaald[veld as keyof Deelnemer], waarde, `na ophalen: ${veld}`)
    }

    const rij = await rijInDatabase(deelnemer.id)
    for (const [veld, waarde] of Object.entries(invoer)) {
      assert.equal(rij[veld as keyof Deelnemer], waarde, `in de database: ${veld}`)
    }
  })

  it("bewaart de kaartstatus (MK en VL) als echte ja/nee-waarden", async () => {
    const deelnemer = await maakDeelnemer({ heeft_mk: true, heeft_vl: false })

    assert.equal(deelnemer.heeft_mk, true)
    assert.equal(deelnemer.heeft_vl, false)

    const opgehaald = await leesDeelnemer(deelnemer.id)
    assert.equal(opgehaald.heeft_mk, true)
    assert.equal(opgehaald.heeft_vl, false)

    const rij = await rijInDatabase(deelnemer.id)
    assert.equal(rij.heeft_mk, true)
    assert.equal(rij.heeft_vl, false)
  })

  it("werkt mobiliteit, kaartstatus en tweede telefoonnummer bij", async () => {
    const deelnemer = await maakDeelnemer({
      mobiliteit: ["rollator"],
      heeft_mk: true,
      heeft_vl: false,
      telefoon_alt: "06-11111111",
    })

    const antwoord = await verzoek(`/${deelnemer.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        mobiliteit: ["scootmobiel"],
        heeft_mk: false,
        heeft_vl: true,
        telefoon_alt: "06-22222222",
      }),
    })
    assert.equal(antwoord.status, 200, JSON.stringify(antwoord.data))

    const opgehaald = await leesDeelnemer(deelnemer.id)
    assert.deepEqual(opgehaald.mobiliteit, ["scootmobiel"])
    assert.equal(opgehaald.heeft_mk, false)
    assert.equal(opgehaald.heeft_vl, true)
    assert.equal(opgehaald.telefoon_alt, "06-22222222")

    const rij = await rijInDatabase(deelnemer.id)
    assert.deepEqual(rij.mobiliteit, ["scootmobiel"])
    assert.equal(rij.heeft_mk, false)
    assert.equal(rij.heeft_vl, true)
    assert.equal(rij.telefoon_alt, "06-22222222")
  })

  it("bewaart de deelnemerstatus actief, gepauzeerd en gestopt", async () => {
    const deelnemer = await maakDeelnemer({ status: "actief" })

    const pauzeer = await verzoek(`/${deelnemer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "gepauzeerd" }),
    })
    assert.equal(pauzeer.status, 200, JSON.stringify(pauzeer.data))
    assert.equal((await rijInDatabase(deelnemer.id)).status, "gepauzeerd")

    const stop = await verzoek(`/${deelnemer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "gestopt" }),
    })
    assert.equal(stop.status, 200, JSON.stringify(stop.data))
    const gestopt = await rijInDatabase(deelnemer.id)
    assert.equal(gestopt.status, "gestopt")
    assert.ok(gestopt.gestopt_op, "bij stoppen hoort een stopdatum te worden vastgelegd")

    const herstart = await verzoek(`/${deelnemer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "actief" }),
    })
    assert.equal(herstart.status, 200, JSON.stringify(herstart.data))
    const actief = await rijInDatabase(deelnemer.id)
    assert.equal(actief.status, "actief")
    assert.equal(actief.gestopt_op, null)
  })
})
