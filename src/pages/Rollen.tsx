import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Select,
  Tabel,
  Veld,
} from "../components/ui"

type Rol = {
  id: number
  naam: string
  beschrijving: string | null
  rechten: Record<string, Record<string, boolean>>
  standaard: boolean
  aantal_gebruikers: number
}

type Onderdeel = { sleutel: string; naam: string; module?: string }
type Actie = "zien" | "aanmaken" | "wijzigen" | "verwijderen"

const ACTIE_TEKST: Record<Actie, string> = {
  zien: "Zien",
  aanmaken: "Aanmaken",
  wijzigen: "Wijzigen",
  verwijderen: "Verwijderen",
}

export function Rollen() {
  const { mag, moduleAan } = useAuth()
  const [rollen, setRollen] = useState<Rol[]>([])
  const [onderdelen, setOnderdelen] = useState<Onderdeel[]>([])
  const [acties, setActies] = useState<Actie[]>([])
  const [gekozenId, setGekozenId] = useState<number | null>(null)
  const [rechten, setRechten] = useState<Record<string, Record<string, boolean>>>({})
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [nieuw, setNieuw] = useState(false)
  const [nieuweRol, setNieuweRol] = useState({ naam: "", beschrijving: "" })

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<{ rollen: Rol[]; onderdelen: Onderdeel[]; acties: Actie[] }>("/rollen")
      setRollen(antwoord.rollen)
      setOnderdelen(antwoord.onderdelen)
      setActies(antwoord.acties)
      const eerste = antwoord.rollen.find((rol) => rol.id === gekozenId) ?? antwoord.rollen[0]
      if (eerste) {
        setGekozenId(eerste.id)
        setRechten(eerste.rechten ?? {})
      }
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

  const gekozen = rollen.find((rol) => rol.id === gekozenId)

  function kies(rol: Rol) {
    setGekozenId(rol.id)
    setRechten(rol.rechten ?? {})
    setMelding(null)
  }

  function wissel(onderdeel: string, actie: Actie) {
    setRechten((huidig) => ({
      ...huidig,
      [onderdeel]: { ...huidig[onderdeel], [actie]: !huidig?.[onderdeel]?.[actie] },
    }))
  }

  async function opslaan() {
    if (!gekozen) return
    setBezig(true)
    setFout(null)
    try {
      await api(`/rollen/${gekozen.id}`, {
        method: "PATCH",
        body: JSON.stringify({ rechten }),
      })
      setMelding(`De rechten van rol "${gekozen.naam}" zijn opgeslagen.`)
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function maakRol() {
    setBezig(true)
    try {
      const antwoord = await api<{ rol: Rol }>("/rollen", {
        method: "POST",
        body: JSON.stringify({ ...nieuweRol, rechten: {} }),
      })
      setNieuw(false)
      setNieuweRol({ naam: "", beschrijving: "" })
      setMelding(`Rol "${antwoord.rol.naam}" is aangemaakt. Zet nu de rechten aan.`)
      await haal()
      setGekozenId(antwoord.rol.id)
      setRechten(antwoord.rol.rechten ?? {})
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />

  return (
    <div>
      <PaginaKop
        titel="Rollen en rechten"
        stap="Kies een rol en zet de rechten per onderdeel goed."
        uitleg="Stel per rol in wat iemand per onderdeel mag: zien, aanmaken, wijzigen of verwijderen. De rol Admin heeft altijd alles."
        acties={
          mag("rollen", "aanmaken") ? (
            <Knop variant="primair" onClick={() => setNieuw(true)}>
              Eigen rol aanmaken
            </Knop>
          ) : undefined
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}

      <Kaart titel="Kies een rol">
        <div className="rij">
          {rollen.map((rol) => (
            <Knop
              key={rol.id}
              variant={rol.id === gekozenId ? "primair" : "secundair"}
              onClick={() => kies(rol)}
            >
              {rol.naam}
              <span className="klein" style={{ opacity: 0.75 }}>
                ({rol.aantal_gebruikers})
              </span>
            </Knop>
          ))}
        </div>
        {gekozen?.beschrijving && <p className="klein muted marge-boven">{gekozen.beschrijving}</p>}
      </Kaart>

      {gekozen && (
        <Kaart
          titel={`Rechten van ${gekozen.naam}`}
          uitleg={
            gekozen.naam === "Admin"
              ? "De Admin heeft altijd alle rechten; deze matrix is alleen ter informatie."
              : "Vink aan wat deze rol mag. Een module die uit staat, blijft verborgen ook als het recht aan staat."
          }
          acties={
            gekozen.naam !== "Admin" && mag("rollen", "wijzigen") ? (
              <Knop variant="primair" onClick={() => void opslaan()} disabled={bezig}>
                {bezig ? "Opslaan…" : "Rechten opslaan"}
              </Knop>
            ) : undefined
          }
        >
          <Tabel kolommen={["Onderdeel", ...acties.map((actie) => ACTIE_TEKST[actie]), "Module"]}>
            {onderdelen.map((onderdeel) => (
              <tr key={onderdeel.sleutel}>
                <td>
                  {onderdeel.naam}
                  {gekozen.naam === "Admin" && <Badge toon="goed"> altijd</Badge>}
                </td>
                {acties.map((actie) => (
                  <td key={actie}>
                    <label className="vinkje" style={{ border: "none", padding: 0, background: "none" }}>
                      <input
                        type="checkbox"
                        checked={
                          gekozen.naam === "Admin" ? true : rechten?.[onderdeel.sleutel]?.[actie] === true
                        }
                        disabled={gekozen.naam === "Admin" || !mag("rollen", "wijzigen")}
                        onChange={() => wissel(onderdeel.sleutel, actie)}
                        aria-label={`${onderdeel.naam} ${ACTIE_TEKST[actie]}`}
                      />
                    </label>
                  </td>
                ))}
                <td>
                  {onderdeel.module ? (
                    moduleAan(onderdeel.module) ? (
                      <Badge toon="goed">aan</Badge>
                    ) : (
                      <Badge>uit</Badge>
                    )
                  ) : (
                    <Badge toon="info">kern</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Tabel>
        </Kaart>
      )}

      {nieuw && (
        <Modal
          titel="Eigen rol aanmaken"
          uitleg="Bijvoorbeeld 'Balie' of 'Bestuur'. Daarna stel je de rechten per onderdeel in."
          sluiten={() => setNieuw(false)}
          acties={
            <>
              <Knop onClick={() => setNieuw(false)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void maakRol()} disabled={bezig || !nieuweRol.naam.trim()}>
                Rol aanmaken
              </Knop>
            </>
          }
        >
          <Veld label="Naam van de rol" verplicht>
            <Invoer
              value={nieuweRol.naam}
              onChange={(e) => setNieuweRol({ ...nieuweRol, naam: e.target.value })}
              autoFocus
            />
          </Veld>
          <Veld label="Korte uitleg">
            <Invoer
              value={nieuweRol.beschrijving}
              onChange={(e) => setNieuweRol({ ...nieuweRol, beschrijving: e.target.value })}
            />
          </Veld>
        </Modal>
      )}
    </div>
  )
}

export function Logboek() {
  const [rijen, setRijen] = useState<{ id: number; tijd: string; gebruiker_naam: string; omschrijving: string; entiteit: string; actie: string; oude_waarde: unknown; nieuwe_waarde: unknown }[]>([])
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
      const antwoord = await api<{ rijen: typeof rijen }>(`/logboek?${query.toString()}`)
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
      <PaginaKop
        titel="Wijzigingsoverzicht"
        stap="Zoek op wie, wanneer of welk uitje."
        uitleg="Elke wijziging wordt vastgelegd: wie, wanneer, wat, en de oude en nieuwe waarde. Regels kunnen niet worden gewijzigd of verwijderd, ook niet door de Admin."
      />

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
