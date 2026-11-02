/**
 * Volledig actielogboek. Elke keer dat iemand iets in de app doet — een scherm
 * openen, zoeken, opslaan, inloggen, iets verwijderen — komt er één regel bij in
 * `event_log`. De regels zijn alleen invoegbaar en worden nooit gewijzigd.
 *
 * Het wijzigingsoverzicht (`audit_log`, zie audit.ts) blijft daarnaast bestaan:
 * daar staan de oude en nieuwe waarde van een wijziging bij.
 */
import type { NextFunction, Request, Response } from "express"
import { q } from "./db"

type Regel = {
  methode: "GET" | "POST" | "PATCH" | "DELETE"
  pad: RegExp
  tekst: (match: RegExpMatchArray) => string
}

/**
 * Leesbare beschrijving per route. De volgorde is belangrijk: een specifieke
 * route (zoals /deelnemers/import) moet vóór de algemene (/deelnemers) staan.
 */
const REGELS: Regel[] = [
  // Inloggen en account
  { methode: "POST", pad: /^\/auth\/login$/, tekst: () => "logt in" },
  { methode: "POST", pad: /^\/auth\/twee-staps$/, tekst: () => "rondt de tweestapscontrole af" },
  { methode: "POST", pad: /^\/auth\/uitloggen$/, tekst: () => "logt uit" },
  { methode: "POST", pad: /^\/auth\/wachtwoord-vergeten$/, tekst: () => "vraagt een nieuwe herstelcode aan" },
  { methode: "POST", pad: /^\/auth\/wachtwoord-herstellen$/, tekst: () => "stelt het wachtwoord opnieuw in" },

  // Dashboard
  { methode: "GET", pad: /^\/dashboard$/, tekst: () => "bekijkt het dashboard" },

  // Deelnemers
  { methode: "GET", pad: /^\/deelnemers$/, tekst: () => "bekijkt of doorzoekt de deelnemerslijst" },
  { methode: "GET", pad: /^\/deelnemers\/export$/, tekst: () => "exporteert de deelnemerslijst" },
  {
    methode: "POST",
    pad: /^\/deelnemers\/import\/geschiedenis\/bevestig$/,
    tekst: () => "bevestigt het inladen van de oude bezoekgeschiedenis",
  },
  {
    methode: "POST",
    pad: /^\/deelnemers\/import\/geschiedenis$/,
    tekst: () => "leest oude bezoekgeschiedenis in",
  },
  { methode: "POST", pad: /^\/deelnemers\/import\/bevestig$/, tekst: () => "bevestigt de deelnemersimport" },
  { methode: "POST", pad: /^\/deelnemers\/import$/, tekst: () => "leest een deelnemersbestand in" },
  {
    methode: "POST",
    pad: /^\/deelnemers\/(\d+)\/anonimiseer$/,
    tekst: (m) => `anonimiseert deelnemer #${m[1]}`,
  },
  {
    methode: "GET",
    pad: /^\/deelnemers\/(\d+)\/avg-overzicht$/,
    tekst: (m) => `bekijkt het AVG-overzicht van deelnemer #${m[1]}`,
  },
  { methode: "GET", pad: /^\/deelnemers\/(\d+)$/, tekst: (m) => `bekijkt deelnemer #${m[1]}` },
  { methode: "POST", pad: /^\/deelnemers$/, tekst: () => "voegt een deelnemer toe" },
  { methode: "PATCH", pad: /^\/deelnemers\/(\d+)$/, tekst: (m) => `wijzigt deelnemer #${m[1]}` },

  // Groepjes
  { methode: "GET", pad: /^\/groepjes$/, tekst: () => "bekijkt de groepjes" },
  { methode: "POST", pad: /^\/groepjes$/, tekst: () => "maakt een groepje aan" },
  { methode: "PATCH", pad: /^\/groepjes\/(\d+)$/, tekst: (m) => `wijzigt groepje #${m[1]}` },
  { methode: "DELETE", pad: /^\/groepjes\/(\d+)$/, tekst: (m) => `verwijdert groepje #${m[1]}` },

  // Programma
  { methode: "GET", pad: /^\/periodes$/, tekst: () => "bekijkt het programma" },
  { methode: "POST", pad: /^\/periodes$/, tekst: () => "maakt een periode aan" },
  {
    methode: "POST",
    pad: /^\/periodes\/import\/(\d+)\/ongedaan$/,
    tekst: (m) => `draait programmainport #${m[1]} terug`,
  },
  { methode: "POST", pad: /^\/periodes\/(\d+)\/import\/bevestig$/, tekst: (m) => `bevestigt de import van periode #${m[1]}` },
  { methode: "POST", pad: /^\/periodes\/(\d+)\/import$/, tekst: (m) => `leest een programma in voor periode #${m[1]}` },
  { methode: "POST", pad: /^\/periodes\/(\d+)\/kopieer-vorige$/, tekst: (m) => `kopieert de vorige periode naar periode #${m[1]}` },
  { methode: "GET", pad: /^\/periodes\/(\d+)\/sjabloon$/, tekst: () => "downloadt een importsjabloon" },
  { methode: "GET", pad: /^\/periodes\/(\d+)\/export$/, tekst: (m) => `exporteert periode #${m[1]}` },
  { methode: "GET", pad: /^\/periodes\/(\d+)\/vervoer$/, tekst: (m) => `bekijkt het vervoer van periode #${m[1]}` },
  { methode: "GET", pad: /^\/periodes\/(\d+)$/, tekst: (m) => `bekijkt periode #${m[1]}` },
  { methode: "PATCH", pad: /^\/periodes\/(\d+)$/, tekst: (m) => `wijzigt periode #${m[1]}` },
  { methode: "POST", pad: /^\/periodes\/(\d+)\/uitjes$/, tekst: (m) => `voegt een uitje toe aan periode #${m[1]}` },
  { methode: "GET", pad: /^\/uitje\/(\d+)\/deelnemerslijst$/, tekst: (m) => `bekijkt de deelnemerslijst van uitje #${m[1]}` },
  { methode: "POST", pad: /^\/uitje\/(\d+)\/voertuigen$/, tekst: (m) => `past de voertuigen van uitje #${m[1]} aan` },
  { methode: "DELETE", pad: /^\/uitje-voertuig\/(\d+)$/, tekst: (m) => `haalt voertuig #${m[1]} van een uitje` },
  { methode: "POST", pad: /^\/uitje\/(\d+)\/annuleer$/, tekst: (m) => `annuleert uitje #${m[1]}` },
  { methode: "POST", pad: /^\/uitje\/(\d+)\/afronden$/, tekst: (m) => `rondt uitje #${m[1]} af` },
  { methode: "GET", pad: /^\/uitje\/(\d+)$/, tekst: (m) => `bekijkt uitje #${m[1]}` },
  { methode: "PATCH", pad: /^\/uitje\/(\d+)$/, tekst: (m) => `wijzigt uitje #${m[1]}` },

  // Telefonische opgave
  { methode: "GET", pad: /^\/opgave\/overzicht$/, tekst: () => "bekijkt het opgaveoverzicht" },
  { methode: "GET", pad: /^\/opgave\/deelnemer\/(\d+)$/, tekst: (m) => `bekijkt de opgaven van deelnemer #${m[1]}` },
  { methode: "POST", pad: /^\/opgave$/, tekst: () => "legt een telefonische opgave vast" },
  { methode: "DELETE", pad: /^\/opgave\/(\d+)$/, tekst: (m) => `verwijdert opgave #${m[1]}` },

  // Eerlijke indeling
  { methode: "POST", pad: /^\/indeling\/(\d+)\/bereken$/, tekst: (m) => `berekent een nieuwe indeling voor periode #${m[1]}` },
  { methode: "POST", pad: /^\/indeling\/(\d+)\/bevestig$/, tekst: (m) => `bevestigt de indeling van periode #${m[1]}` },
  { methode: "GET", pad: /^\/indeling\/(\d+)\/verschillen$/, tekst: (m) => `bekijkt de verschillen in de indeling van periode #${m[1]}` },
  { methode: "PATCH", pad: /^\/indeling\/rij\/(\d+)$/, tekst: (m) => `past een indeling handmatig aan (#${m[1]})` },
  { methode: "GET", pad: /^\/indeling\/(\d+)$/, tekst: (m) => `bekijkt de indeling van periode #${m[1]}` },

  // Reservelijst en bellijst
  { methode: "GET", pad: /^\/bellijst$/, tekst: () => "bekijkt de reservelijst" },
  { methode: "POST", pad: /^\/bellijst\/(\d+)\/reserve-uitkomst$/, tekst: (m) => `verwerkt de uitkomst van reserveplek #${m[1]}` },
  { methode: "PATCH", pad: /^\/bellijst\/(\d+)$/, tekst: (m) => `werkt belafspraak #${m[1]} bij` },

  // Declaraties en kas
  { methode: "GET", pad: /^\/declaraties$/, tekst: () => "bekijkt de declaraties" },
  { methode: "POST", pad: /^\/declaraties$/, tekst: () => "dient een declaratie in" },
  { methode: "GET", pad: /^\/declaraties\/export$/, tekst: () => "exporteert de declaraties" },
  { methode: "GET", pad: /^\/declaraties\/maandoverzicht\/export$/, tekst: () => "exporteert het maandoverzicht" },
  { methode: "GET", pad: /^\/declaraties\/maandoverzicht$/, tekst: () => "bekijkt het maandoverzicht" },
  { methode: "GET", pad: /^\/declaraties\/mijn-uitjes$/, tekst: () => "bekijkt zijn of haar eigen uitjes" },
  { methode: "GET", pad: /^\/declaraties\/kas\/overzicht$/, tekst: () => "bekijkt het kasoverzicht" },
  { methode: "POST", pad: /^\/declaraties\/kas\/afsluiting$/, tekst: () => "sluit de kas af" },
  { methode: "POST", pad: /^\/declaraties\/kas\/storting$/, tekst: () => "registreert een storting" },
  { methode: "POST", pad: /^\/declaraties\/(\d+)\/beoordelen$/, tekst: (m) => `beoordeelt declaratie #${m[1]}` },
  { methode: "POST", pad: /^\/declaraties\/(\d+)\/uitbetalen$/, tekst: (m) => `betaalt declaratie #${m[1]} uit` },
  { methode: "PATCH", pad: /^\/declaraties\/(\d+)$/, tekst: (m) => `wijzigt declaratie #${m[1]}` },
  { methode: "DELETE", pad: /^\/declaraties\/(\d+)$/, tekst: (m) => `verwijdert declaratie #${m[1]}` },

  // Vervoer
  { methode: "GET", pad: /^\/voertuigen$/, tekst: () => "bekijkt de voertuigen" },
  { methode: "POST", pad: /^\/voertuigen$/, tekst: () => "voegt een voertuig toe" },
  { methode: "PATCH", pad: /^\/voertuigen\/(\d+)$/, tekst: (m) => `wijzigt voertuig #${m[1]}` },

  // Beheer
  { methode: "GET", pad: /^\/gebruikers$/, tekst: () => "bekijkt de gebruikers" },
  { methode: "POST", pad: /^\/gebruikers$/, tekst: () => "voegt een gebruiker toe" },
  { methode: "PATCH", pad: /^\/gebruikers\/(\d+)\/functies$/, tekst: (m) => `past de functies van gebruiker #${m[1]} aan` },
  { methode: "PATCH", pad: /^\/gebruikers\/(\d+)$/, tekst: (m) => `wijzigt gebruiker #${m[1]}` },
  { methode: "GET", pad: /^\/rollen$/, tekst: () => "bekijkt de rollen en rechten" },
  { methode: "POST", pad: /^\/rollen$/, tekst: () => "maakt een rol aan" },
  { methode: "PATCH", pad: /^\/rollen\/(\d+)$/, tekst: (m) => `wijzigt rol #${m[1]}` },
  { methode: "GET", pad: /^\/modules$/, tekst: () => "bekijkt de functies" },
  { methode: "PATCH", pad: /^\/modules\/([\w-]+)$/, tekst: (m) => `zet functie "${m[1]}" aan of uit` },
  { methode: "GET", pad: /^\/instellingen$/, tekst: () => "bekijkt de instellingen" },
  { methode: "PATCH", pad: /^\/instellingen$/, tekst: () => "past de instellingen aan" },
  { methode: "GET", pad: /^\/logboek$/, tekst: () => "bekijkt het wijzigingsoverzicht" },
  { methode: "GET", pad: /^\/eventlog$/, tekst: () => "bekijkt het actielogboek" },
  { methode: "POST", pad: /^\/assistent$/, tekst: () => "stelt een vraag aan de assistent" },
  { methode: "POST", pad: /^\/feedback$/, tekst: () => "stuurt een feedbackmelding" },
  { methode: "GET", pad: /^\/feedback$/, tekst: () => "bekijkt de feedback" },
  { methode: "PATCH", pad: /^\/feedback\/(\d+)$/, tekst: (m) => `wijzigt feedback #${m[1]}` },
]

const ONDERDELEN: Record<string, string> = {
  auth: "inloggen",
  dashboard: "dashboard",
  deelnemers: "deelnemers",
  groepjes: "groepjes",
  periodes: "programma",
  uitje: "programma",
  "uitje-voertuig": "vervoer",
  opgave: "opgave",
  indeling: "indeling",
  bellijst: "reservelijst",
  declaraties: "declaraties",
  voertuigen: "vervoer",
  gebruikers: "gebruikers",
  rollen: "rollen",
  modules: "functies",
  instellingen: "instellingen",
  logboek: "logboek",
  eventlog: "logboek",
  assistent: "assistent",
  feedback: "feedback",
}

function onderdeelVan(pad: string): string {
  if (pad.startsWith("/declaraties/kas")) return "kas"
  const eerste = pad.split("/").filter(Boolean)[0] ?? ""
  return ONDERDELEN[eerste] ?? "overig"
}

export function beschrijfActie(methode: string, pad: string): { onderdeel: string; omschrijving: string } {
  const schoon = pad.replace(/\/+$/, "") || "/"
  for (const regel of REGELS) {
    if (regel.methode !== methode) continue
    const match = schoon.match(regel.pad)
    if (match) return { onderdeel: onderdeelVan(schoon), omschrijving: regel.tekst(match) }
  }
  const werkwoord =
    methode === "GET"
      ? "bekijkt"
      : methode === "DELETE"
        ? "verwijdert iets via"
        : methode === "POST"
          ? "voert een actie uit op"
          : "wijzigt iets via"
  return { onderdeel: onderdeelVan(schoon), omschrijving: `${werkwoord} ${schoon}` }
}

/** Deze paden zijn technische controles en geen handeling van een gebruiker. */
const STIL = new Set(["/gezondheid", "/auth/ik"])

/**
 * Legt elke API-handeling vast zodra het antwoord klaar is. De regel wordt op de
 * achtergrond weggeschreven, zodat het antwoord aan de gebruiker niet wacht.
 */
export function logActies(req: Request, res: Response, next: NextFunction): void {
  // Meteen vastleggen: zodra het antwoord klaar is, heeft Express req.url alweer
  // teruggezet naar het volledige adres en is req.path niet meer betrouwbaar.
  const pad = req.path
  if (req.method === "OPTIONS" || STIL.has(pad)) {
    next()
    return
  }
  const begonnen = Date.now()
  res.on("finish", () => {
    const { onderdeel, omschrijving } = beschrijfActie(req.method, pad)
    const gebruiker = req.gebruiker
    void q(
      `insert into event_log
         (gebruiker_id, gebruiker_naam, actie, onderdeel, omschrijving, methode, pad, status, duur_ms)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        gebruiker?.id ?? null,
        gebruiker?.naam ?? "Onbekend",
        req.method,
        onderdeel,
        omschrijving,
        req.method,
        pad,
        res.statusCode,
        Date.now() - begonnen,
      ],
    ).catch((fout) => {
      console.error("[eventlog] kon handeling niet vastleggen:", fout)
    })
  })
  next()
}
