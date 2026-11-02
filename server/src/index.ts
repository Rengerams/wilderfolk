import express, { type NextFunction, type Request, type Response } from "express"
import { initDb, pool } from "./db"
import { mag, vereisLogin } from "./auth"
import { logActies } from "./eventlog"
import type { RechtActie } from "./schema"
import { authRouter } from "./routes/auth"
import { beheerRouter } from "./routes/beheer"
import { bellijstRouter, indelingRouter } from "./routes/indeling"
import { deelnemersRouter } from "./routes/deelnemers"
import { geldRouter, voertuigenRouter } from "./routes/geld"
import { groepjesRouter } from "./routes/groepjes"
import { opgaveRouter } from "./routes/opgave"
import { programmaRouter } from "./routes/programma"
import { rapportageRouter } from "./routes/rapportage"

const app = express()
app.set("trust proxy", true)
app.disable("x-powered-by")
app.use(express.json({ limit: "15mb" }))

/** Basishygiëne voor elke reactie. Geen frame- of CSP-regels: de preview toont de app in een iframe. */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "same-origin")
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  // Deelnemersgegevens horen niet in een cache van browser of proxy.
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store")
  next()
})

/**
 * Bescherming tegen meeschrijven vanaf een andere website (CSRF). De sessiecookie
 * is al sameSite=lax; dit vangt de laatste gevallen af. Alleen een uitdrukkelijk
 * cross-site verzoek wordt geweigerd, zodat de preview en gewone navigatie werken.
 */
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next()
    return
  }
  if (req.headers["sec-fetch-site"] === "cross-site") {
    res.status(403).json({ fout: "Dit verzoek komt van een andere site en is daarom geweigerd." })
    return
  }
  next()
})

/**
 * Rechtenpoort per onderdeel. Standaard: lezen = zien, aanmaken = aanmaken,
 * wijzigen = wijzigen, verwijderen = verwijderen. Voor acties die geen gewone
 * CRUD zijn, staat hieronder een expliciete uitzondering.
 */
type Uitzondering = { methode: string; pad: RegExp; actie: RechtActie }

function poort(onderdeel: string, uitzonderingen: Uitzondering[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    const uitzondering = uitzonderingen.find(
      (regel) => regel.methode === req.method && regel.pad.test(req.path),
    )
    const actie: RechtActie =
      uitzondering?.actie ??
      (req.method === "GET"
        ? "zien"
        : req.method === "POST"
          ? "aanmaken"
          : req.method === "PATCH" || req.method === "PUT"
            ? "wijzigen"
            : "verwijderen")
    if (!mag(req.gebruiker, onderdeel, actie)) {
      res.status(403).json({ fout: "Je hebt geen rechten voor deze actie. Vraag de beheerder om toegang." })
      return
    }
    next()
  }
}

// Volledig actielogboek: elke handeling in de app wordt hier vastgelegd.
app.use("/api", logActies)

app.get("/api/gezondheid", (_req, res) => {
  res.json({ status: "ok", tijd: new Date().toISOString() })
})

app.use("/api/auth", authRouter)
app.use("/api", vereisLogin)

app.use(
  "/api/deelnemers",
  poort("deelnemers", [
    { methode: "POST", pad: /^\/\d+\/anonimiseren$/, actie: "verwijderen" },
    { methode: "GET", pad: /\/avg-overzicht$/, actie: "zien" },
  ]),
  deelnemersRouter,
)
app.use("/api/groepjes", poort("groepjes"), groepjesRouter)
app.use(
  "/api/periodes",
  poort("programma", [
    { methode: "PATCH", pad: /^\/\d+$/, actie: "wijzigen" },
    { methode: "POST", pad: /\/import$/, actie: "aanmaken" },
    { methode: "POST", pad: /\/import\/bevestig$/, actie: "aanmaken" },
    { methode: "POST", pad: /\/import\/\d+\/ongedaan$/, actie: "aanmaken" },
    { methode: "POST", pad: /\/kopieer-vorige$/, actie: "aanmaken" },
    { methode: "POST", pad: /^\/uitje\/\d+\/(annuleer|afronden|voertuigen)$/, actie: "wijzigen" },
    { methode: "PATCH", pad: /^\/uitje\/\d+$/, actie: "wijzigen" },
    { methode: "DELETE", pad: /^\/uitje-voertuig\/\d+$/, actie: "wijzigen" },
  ]),
  programmaRouter,
)
app.use("/api/opgave", poort("opgave"), opgaveRouter)
app.use("/api/indeling", poort("indeling"), indelingRouter)
app.use(
  "/api/bellijst",
  poort("reservelijst", [
    { methode: "POST", pad: /\/reserve-uitkomst$/, actie: "wijzigen" },
    { methode: "PATCH", pad: /^\/\d+$/, actie: "wijzigen" },
  ]),
  bellijstRouter,
)
app.use(
  "/api/declaraties",
  poort("declaraties", [
    { methode: "PATCH", pad: /^\/\d+$/, actie: "wijzigen" },
    { methode: "POST", pad: /\/beoordelen$/, actie: "wijzigen" },
    { methode: "POST", pad: /\/uitbetalen$/, actie: "wijzigen" },
    { methode: "DELETE", pad: /^\/\d+$/, actie: "wijzigen" },
  ]),
  geldRouter,
)
app.use("/api/voertuigen", poort("vervoer"), voertuigenRouter)
app.use("/api/rapportage", poort("rapportage"), rapportageRouter)
app.use("/api", beheerRouter)

app.use((req, res) => {
  res.status(404).json({ fout: `Onbekend adres: ${req.method} ${req.path}` })
})

app.use((fout: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] fout:", fout)
  const bericht =
    fout instanceof Error ? fout.message : "Er ging iets mis. Probeer het nog eens."
  if (fout instanceof SyntaxError && "body" in fout) {
    res.status(400).json({ fout: "Het verzoek kon niet worden gelezen." })
    return
  }
  if (/bestaat niet/.test(bericht)) {
    res.status(404).json({ fout: bericht })
    return
  }
  // Interne fouten (zoals databasefouten) nooit met technische details naar buiten.
  res.status(500).json({ fout: "Er ging iets mis aan de kant van de server. Probeer het nog eens." })
})

const poortNummer = Number(process.env.PORT ?? 4000)

async function start() {
  await initDb()
  app.listen(poortNummer, "0.0.0.0", () => {
    console.log(`[api] Beheersysteem Diligence luistert op poort ${poortNummer}`)
  })
}

for (const signaal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signaal, () => {
    void pool.end().finally(() => process.exit(0))
  })
}

start().catch((fout) => {
  console.error("[api] kon niet starten:", fout)
  process.exit(1)
})
