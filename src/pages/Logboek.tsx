import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { Badge, Invoer, Kaart, Knop, Laad, Melding, PaginaKop, Select, Tabel, Veld } from "../components/ui"

type Wijziging = {
  id: number
  tijd: string
  gebruiker_naam: string
  omschrijving: string
  entiteit: string
  actie: string
  oude_waarde: unknown
  nieuwe_waarde: unknown
}

type Actie = {
  id: number
  tijd: string
  gebruiker_naam: string
  actie: string
  onderdeel: string
  omschrijving: string
  methode: string
  pad: string
  status: number
  duur_ms: number
}

const ONDERDELEN = [
  "deelnemers",
  "groepjes",
  "programma",
  "opgave",
  "indeling",
  "reservelijst",
  "vervoer",
  "declaraties",
  "kas",
  "gebruikers",
  "rollen",
  "functies",
  "instellingen",
  "logboek",
  "feedback",
  "assistent",
  "dashboard",
  "inloggen",
  "overig",
]

function Resultaat({ status }: { status: number }) {
  if (status < 400) return <Badge toon="goed">Gelukt</Badge>
  if (status === 401) return <Badge toon="waarschuwing">Niet ingelogd</Badge>
  if (status === 403) return <Badge toon="fout">Geweigerd</Badge>
  return <Badge toon="fout">Mislukt</Badge>
}

/** Alle handelingen: elke keer dat iemand een scherm opent, zoekt of iets opslaat. */
function Acties() {
  const [rijen, setRijen] = useState<Actie[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [filters, setFilters] = useState({ zoek: "", onderdeel: "", gebruiker: "", van: "", tot: "" })

  async function haal() {
    setLaden(true)
    try {
      const query = new URLSearchParams()
      for (const [sleutel, waarde] of Object.entries(filters)) {
        if (waarde) query.set(sleutel, waarde)
      }
      const antwoord = await api<{ rijen: Actie[] }>(`/eventlog?${query.toString()}`)
      setRijen(antwoord.rijen)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {fout && <Melding type="fout">{fout}</Melding>}

      <Kaart>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault()
            void haal()
          }}
        >
          <Veld label="Zoeken">
            <Invoer
              type="search"
              value={filters.zoek}
              onChange={(e) => setFilters({ ...filters, zoek: e.target.value })}
              placeholder="Bijvoorbeeld: Jan de Vries of uitje"
            />
          </Veld>
          <Veld label="Onderdeel">
            <Select value={filters.onderdeel} onChange={(e) => setFilters({ ...filters, onderdeel: e.target.value })}>
              <option value="">Alles</option>
              {ONDERDELEN.map((onderdeel) => (
                <option key={onderdeel} value={onderdeel}>
                  {onderdeel}
                </option>
              ))}
            </Select>
          </Veld>
          <Veld label="Medewerker">
            <Invoer
              value={filters.gebruiker}
              onChange={(e) => setFilters({ ...filters, gebruiker: e.target.value })}
            />
          </Veld>
          <Veld label="Vanaf">
            <Invoer type="date" value={filters.van} onChange={(e) => setFilters({ ...filters, van: e.target.value })} />
          </Veld>
          <Veld label="Tot en met">
            <Invoer type="date" value={filters.tot} onChange={(e) => setFilters({ ...filters, tot: e.target.value })} />
          </Veld>
          <Knop variant="primair" type="submit">
            Filteren
          </Knop>
        </form>
      </Kaart>

      <Kaart titel={`Handelingen (${rijen.length})`} uitleg="De laatste 200 handelingen, nieuwste eerst.">
        {laden ? (
          <Laad />
        ) : rijen.length === 0 ? (
          <p className="muted">Geen handelingen gevonden met deze filters.</p>
        ) : (
          <Tabel kolommen={["Wanneer", "Wie", "Wat", "Onderdeel", "Resultaat"]}>
            {rijen.map((rij) => (
              <tr key={rij.id}>
                <td className="nu">{new Date(rij.tijd).toLocaleString("nl-NL")}</td>
                <td>{rij.gebruiker_naam}</td>
                <td>
                  {rij.omschrijving}
                  <div className="klein muted">
                    {rij.methode} {rij.pad}
                    {rij.duur_ms > 0 && ` · ${rij.duur_ms} ms`}
                  </div>
                </td>
                <td>
                  <Badge>{rij.onderdeel}</Badge>
                </td>
                <td>
                  <Resultaat status={rij.status} />
                </td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>
    </div>
  )
}

/** Wijzigingen met de oude en nieuwe waarde (het bestaande wijzigingsoverzicht). */
function Wijzigingen() {
  const [rijen, setRijen] = useState<Wijziging[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [filters, setFilters] = useState({ zoek: "", entiteit: "", van: "", tot: "", gebruiker: "" })

  async function haal() {
    setLaden(true)
    try {
      const query = new URLSearchParams()
      for (const [sleutel, waarde] of Object.entries(filters)) {
        if (waarde) query.set(sleutel, waarde)
      }
      const antwoord = await api<{ rijen: Wijziging[] }>(`/logboek?${query.toString()}`)
      setRijen(antwoord.rijen)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      {fout && <Melding type="fout">{fout}</Melding>}

      <Kaart>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault()
            void haal()
          }}
        >
          <Veld label="Zoeken">
            <Invoer
              type="search"
              value={filters.zoek}
              onChange={(e) => setFilters({ ...filters, zoek: e.target.value })}
              placeholder="Bijvoorbeeld: Jan de Vries"
            />
          </Veld>
          <Veld label="Onderdeel">
            <Select value={filters.entiteit} onChange={(e) => setFilters({ ...filters, entiteit: e.target.value })}>
              <option value="">Alles</option>
              <option value="deelnemer">Deelnemer</option>
              <option value="groepje">Groepje</option>
              <option value="uitje">Uitje</option>
              <option value="periode">Periode</option>
              <option value="indeling">Indeling</option>
              <option value="declaratie">Declaratie</option>
              <option value="kas">Kas</option>
              <option value="gebruiker">Gebruiker</option>
              <option value="rol">Rol</option>
              <option value="module">Module</option>
              <option value="feedback">Feedback</option>
            </Select>
          </Veld>
          <Veld label="Medewerker">
            <Invoer
              value={filters.gebruiker}
              onChange={(e) => setFilters({ ...filters, gebruiker: e.target.value })}
            />
          </Veld>
          <Veld label="Vanaf">
            <Invoer type="date" value={filters.van} onChange={(e) => setFilters({ ...filters, van: e.target.value })} />
          </Veld>
          <Veld label="Tot en met">
            <Invoer type="date" value={filters.tot} onChange={(e) => setFilters({ ...filters, tot: e.target.value })} />
          </Veld>
          <Knop variant="primair" type="submit">
            Filteren
          </Knop>
        </form>
      </Kaart>

      <Kaart titel={`Regels (${rijen.length})`}>
        {laden ? (
          <Laad />
        ) : rijen.length === 0 ? (
          <p className="muted">Geen regels gevonden met deze filters.</p>
        ) : (
          <Tabel kolommen={["Wanneer", "Wie", "Wat", "Onderdeel"]}>
            {rijen.map((rij) => (
              <tr key={rij.id}>
                <td className="nu">{new Date(rij.tijd).toLocaleString("nl-NL")}</td>
                <td>{rij.gebruiker_naam}</td>
                <td>
                  {rij.omschrijving}
                  {Boolean(rij.oude_waarde || rij.nieuwe_waarde) && (
                    <details className="marge-boven--klein">
                      <summary className="klein muted">Details</summary>
                      <pre className="klein" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
{JSON.stringify({ oud: rij.oude_waarde, nieuw: rij.nieuwe_waarde }, null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
                <td>
                  <Badge>{rij.entiteit}</Badge>
                </td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>
    </div>
  )
}

export function Logboek() {
  const [tab, setTab] = useState<"acties" | "wijzigingen">("acties")

  return (
    <div>
      <PaginaKop
        titel="Logboek"
        uitleg="Elke handeling in de app wordt vastgelegd: wie, wanneer, wat en of het gelukt is. Regels kunnen niet worden gewijzigd of verwijderd, ook niet door de Admin."
        stap="Zoek op medewerker, onderdeel of datum."
      />

      <div className="weergave-balk" role="group" aria-label="Soort logboek">
        <button
          type="button"
          className={`weergave-tab${tab === "acties" ? " is-actief" : ""}`}
          aria-pressed={tab === "acties"}
          onClick={() => setTab("acties")}
        >
          Alle acties
        </button>
        <button
          type="button"
          className={`weergave-tab${tab === "wijzigingen" ? " is-actief" : ""}`}
          aria-pressed={tab === "wijzigingen"}
          onClick={() => setTab("wijzigingen")}
        >
          Wijzigingen met oude en nieuwe waarde
        </button>
      </div>

      {tab === "acties" ? <Acties /> : <Wijzigingen />}
    </div>
  )
}
