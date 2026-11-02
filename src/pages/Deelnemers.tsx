import { Fragment, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api, bestandAlsBase64, download, duplicatenUitFout, foutTekst, initiaal } from "../api"
import { DeelnemerForm, type DeelnemerVelden } from "../components/DeelnemerForm"
import { GeschiedenisImport } from "../components/GeschiedenisImport"
import {
  Badge,
  Bevestig,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Tabel,
  TabelGroep,
  Veld,
} from "../components/ui"
import { datumNumeriek, volledigeNaam } from "../lib/format"
import type { Deelnemer } from "../types"
import { useAuth } from "../auth"

type ImportRegel = {
  rij: number
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  telefoon: string
  plaats: string
  fouten: string[]
  duplicaat: string | null
}

const STATUS_TABS = [
  { waarde: "actief", label: "Actief" },
  { waarde: "gepauzeerd", label: "Gepauzeerd" },
  { waarde: "gestopt", label: "Gestopt" },
  { waarde: "alles", label: "Alles" },
] as const

const STATUS_LABEL: Record<string, string> = {
  actief: "Actief",
  gepauzeerd: "Gepauzeerd",
  gestopt: "Gestopt",
}

const STATUS_GROEPEN = [
  { waarde: "actief", label: "Actief", toon: "goed" },
  { waarde: "gepauzeerd", label: "Tijdelijk gepauzeerd", toon: "waarschuwing" },
  { waarde: "gestopt", label: "Gestopt", toon: "neutraal" },
] as const

type ImportControle = {
  regels: ImportRegel[]
  aantal: number
  fouten: number
  duplicaten: number
}

export function Deelnemers() {
  const { mag } = useAuth()
  const navigate = useNavigate()
  const [zoek, setZoek] = useState("")
  const [status, setStatus] = useState("actief")
  const [deelnemers, setDeelnemers] = useState<Deelnemer[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [duplicaten, setDuplicaten] = useState<Deelnemer[] | null>(null)
  const [openstaand, setOpenstaand] = useState<DeelnemerVelden | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importBestand, setImportBestand] = useState<File | null>(null)
  const [importControle, setImportControle] = useState<ImportControle | null>(null)
  const [geschiedenisOpen, setGeschiedenisOpen] = useState(false)

  async function haal(term: string, statusFilter: string) {
    setLaden(true)
    setFout(null)
    try {
      const antwoord = await api<{ deelnemers: Deelnemer[] }>(
        `/deelnemers?q=${encodeURIComponent(term)}&status=${encodeURIComponent(statusFilter)}`,
      )
      setDeelnemers(antwoord.deelnemers)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void haal(zoek, status), zoek ? 180 : 0)
    return () => clearTimeout(timer)
  }, [zoek, status])

  async function controleerImport() {
    if (!importBestand) return
    setBezig(true)
    setFout(null)
    try {
      const bestand = await bestandAlsBase64(importBestand)
      const antwoord = await api<ImportControle>("/deelnemers/import", {
        method: "POST",
        body: JSON.stringify({ bestand, bestandsnaam: importBestand.name }),
      })
      setImportControle(antwoord)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function bevestigImport() {
    if (!importControle) return
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ bericht: string }>("/deelnemers/import/bevestig", {
        method: "POST",
        body: JSON.stringify({ regels: importControle.regels }),
      })
      setImportOpen(false)
      setImportControle(null)
      setImportBestand(null)
      setMelding(antwoord.bericht)
      await haal(zoek, status)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function opslaan(velden: DeelnemerVelden, negeerDuplicaat = false) {
    setBezig(true)
    setFout(null)
    try {
      await api("/deelnemers", {
        method: "POST",
        body: JSON.stringify({ ...velden, negeer_duplicaat: negeerDuplicaat }),
      })
      setNieuwOpen(false)
      setDuplicaten(null)
      setOpenstaand(null)
      setMelding(`${velden.voornaam} ${velden.achternaam} is toegevoegd aan de deelnemerslijst.`)
      await haal(zoek, status)
    } catch (e) {
      const gevonden = duplicatenUitFout(e)
      if (gevonden.length > 0) {
        setDuplicaten(gevonden as unknown as Deelnemer[])
        setOpenstaand(velden)
      } else {
        setFout(foutTekst(e))
      }
    } finally {
      setBezig(false)
    }
  }

  const teImporteren = importControle
    ? importControle.aantal - importControle.fouten - importControle.duplicaten
    : 0

  return (
    <div>
      <PaginaKop
        titel="Deelnemers"
        stap="Zoek de deelnemer of maak een nieuwe aan."
        uitleg="Zoek op naam of telefoonnummer. Typ een paar letters en de lijst past zich meteen aan."
        acties={
          <>
            <Knop onClick={() => void download("/deelnemers/export", "deelnemers.csv")}>
              Deelnemers als CSV
            </Knop>
            {mag("deelnemers", "aanmaken") && (
              <>
                <Knop onClick={() => setImportOpen(true)}>Deelnemers inladen</Knop>
                <Knop onClick={() => setGeschiedenisOpen(true)}>Bezoekgeschiedenis inladen</Knop>
                <Knop variant="primair" onClick={() => setNieuwOpen(true)}>
                  Nieuwe deelnemer
                </Knop>
              </>
            )}
          </>
        }
      />

      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {fout && <Melding type="fout">{fout}</Melding>}

      <Kaart>
        <div className="weergave-balk" role="group" aria-label="Status van deelnemers">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.waarde}
              type="button"
              className={`weergave-tab${status === tab.waarde ? " is-actief" : ""}`}
              aria-pressed={status === tab.waarde}
              onClick={() => setStatus(tab.waarde)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="filters">
          <div className="zoekveld">
            <label htmlFor="deelnemer-zoek" className="veld__label">
              Zoeken
            </label>
            <Invoer
              id="deelnemer-zoek"
              type="search"
              placeholder="Naam, deel van de naam of telefoonnummer"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {laden ? (
          <Laad />
        ) : deelnemers.length === 0 ? (
          <div className="leeg">
            <p className="leeg__titel">Geen deelnemers gevonden</p>
            <p className="leeg__uitleg">
              {zoek
                ? "Probeer een andere spelling of een telefoonnummer. Typfouten mogen: we zoeken ook op bijna-goed."
                : "Er staan nog geen deelnemers met deze status. Voeg de eerste deelnemer toe, of laad de bestaande lijst in via Excel."}
            </p>
            {mag("deelnemers", "aanmaken") && (
              <div className="leeg__actie">
                <Knop variant="primair" onClick={() => setNieuwOpen(true)}>
                  Nieuwe deelnemer
                </Knop>
              </div>
            )}
          </div>
        ) : (
          <Tabel kolommen={["Naam", "Telefoon", "Groepje", "Kaarten", "Status", "Laatst mee", { tekst: "Deelnames", getal: true }]}>
            {STATUS_GROEPEN.map((groep) => {
              const rijen = deelnemers.filter((deelnemer) => deelnemer.status === groep.waarde)
              if (rijen.length === 0) return null
              return (
                <Fragment key={groep.waarde}>
                  <TabelGroep label={groep.label} aantal={rijen.length} toon={groep.toon} kolommen={7} />
                  {rijen.map((deelnemer) => (
                    <tr key={deelnemer.id}>
                      <td className="tabel__naam">
                        <span className="tabel__persoon">
                          <span className="avatar avatar--zacht" aria-hidden="true">
                            {initiaal(volledigeNaam(deelnemer))}
                          </span>
                          <Link to={`/deelnemers/${deelnemer.id}`}>{volledigeNaam(deelnemer)}</Link>
                        </span>
                      </td>
                      <td className="nu">{deelnemer.telefoon ?? <span className="muted">—</span>}</td>
                      <td>{deelnemer.groepje_naam ?? <span className="muted">—</span>}</td>
                      <td>
                        {deelnemer.heeft_mk && <span className="tag">MK</span>}
                        {deelnemer.heeft_vl && <span className="tag">VL</span>}
                        {!deelnemer.heeft_mk && !deelnemer.heeft_vl && <span className="muted">—</span>}
                      </td>
                      <td>
                        <Badge toon={deelnemer.status === "actief" ? "goed" : deelnemer.status === "gepauzeerd" ? "waarschuwing" : "neutraal"}>
                          {STATUS_LABEL[deelnemer.status] ?? deelnemer.status}
                        </Badge>
                      </td>
                      <td className="nu">
                        {deelnemer.laatste_deelname ? datumNumeriek(deelnemer.laatste_deelname) : <span className="muted">nog nooit</span>}
                      </td>
                      <td className="getal">{deelnemer.totaal_deelnames}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </Tabel>
        )}
      </Kaart>

      {nieuwOpen && (
        <Modal titel="Nieuwe deelnemer" sluiten={() => setNieuwOpen(false)} breed>
          <DeelnemerForm
            opslaan={(velden) => void opslaan(velden)}
            annuleer={() => setNieuwOpen(false)}
            bezig={bezig}
          />
        </Modal>
      )}

      {importOpen && (
        <Modal
          titel="Deelnemers inladen uit Excel of CSV"
          uitleg="Zo neem je de bestaande deelnemerslijst in één keer over."
          sluiten={() => {
            setImportOpen(false)
            setImportControle(null)
            setImportBestand(null)
          }}
          breed
          acties={
            importControle ? (
              <>
                <Knop onClick={() => setImportControle(null)}>Terug</Knop>
                <Knop
                  variant="primair"
                  onClick={() => void bevestigImport()}
                  disabled={bezig || teImporteren === 0}
                >
                  {bezig ? "Opslaan…" : `Ja, ${teImporteren} deelnemers opslaan`}
                </Knop>
              </>
            ) : (
              <>
                <Knop onClick={() => setImportOpen(false)}>Annuleren</Knop>
                <Knop
                  variant="primair"
                  onClick={() => void controleerImport()}
                  disabled={bezig || !importBestand}
                >
                  {bezig ? "Controleren…" : "Bestand controleren"}
                </Knop>
              </>
            )
          }
        >
          {importControle ? (
            <>
              <Melding type={importControle.fouten + importControle.duplicaten > 0 ? "waarschuwing" : "succes"}>
                Dit worden <strong>{teImporteren} deelnemers</strong>. Klopt dat?
                {importControle.duplicaten > 0 &&
                  ` ${importControle.duplicaten} regel(s) lijken al te bestaan en worden overgeslagen.`}
                {importControle.fouten > 0 &&
                  ` ${importControle.fouten} regel(s) hebben een fout en worden niet opgeslagen.`}
              </Melding>
              <Tabel compact kolommen={["Rij", "Naam", "Telefoon", "Plaats", "Opmerking"]}>
                {importControle.regels.slice(0, 25).map((regel) => (
                  <tr key={regel.rij}>
                    <td>{regel.rij}</td>
                    <td>
                      {[regel.voornaam, regel.tussenvoegsel, regel.achternaam].filter(Boolean).join(" ") || (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nu">{regel.telefoon || <span className="muted">—</span>}</td>
                    <td>{regel.plaats || <span className="muted">—</span>}</td>
                    <td>
                      {regel.fouten.map((importFout) => (
                        <div key={importFout} className="klein" style={{ color: "var(--fout)" }}>
                          {importFout}
                        </div>
                      ))}
                      {regel.duplicaat && (
                        <div className="klein muted">Bestaat al: {regel.duplicaat}</div>
                      )}
                      {regel.fouten.length === 0 && !regel.duplicaat && <Badge toon="goed">in orde</Badge>}
                    </td>
                  </tr>
                ))}
              </Tabel>
              {importControle.regels.length > 25 && (
                <p className="klein muted">En nog {importControle.regels.length - 25} regels.</p>
              )}
            </>
          ) : (
            <>
              <Veld label="Bestand" hint="Excel (.xlsx) of CSV.">
                <Invoer
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setImportBestand(e.target.files?.[0] ?? null)}
                />
              </Veld>
              <Melding type="info">
                Zet in de bovenste regel de kolomnamen: voornaam, tussenvoegsel, achternaam, telefoon, straat,
                huisnummer, postcode en plaats. Opmerkingen en mobiliteit mogen er ook bij staan. Iemand die al in
                het systeem staat, wordt overgeslagen. Er wordt pas opgeslagen als je bevestigt.
              </Melding>
            </>
          )}
        </Modal>
      )}

      {geschiedenisOpen && (
        <GeschiedenisImport
          sluiten={() => setGeschiedenisOpen(false)}
          klaar={(bericht) => {
            setGeschiedenisOpen(false)
            setMelding(bericht)
            void haal(zoek, status)
          }}
        />
      )}

      {duplicaten && openstaand && (
        <Bevestig
          titel="Deze deelnemer lijkt al te bestaan"
          uitleg="Controleer of je niet per ongeluk iemand dubbel vastlegt. Bestaat de deelnemer al, open dan het bestaande dossier."
          bevestigLabel="Nee, het is iemand anders: toch opslaan"
          bezig={bezig}
          bevestig={() => void opslaan(openstaand, true)}
          annuleer={() => {
            setDuplicaten(null)
            setOpenstaand(null)
          }}
        >
          <ul className="lijst">
            {duplicaten.map((dubbel) => (
              <li key={dubbel.id} className="lijst-item">
                <div className="lijst__item__kop">
                  <div>
                    <strong>{volledigeNaam(dubbel)}</strong>
                    <div className="klein muted">
                      {dubbel.telefoon ?? "geen telefoon"} · {dubbel.plaats ?? "geen adres"}
                    </div>
                  </div>
                  <Knop
                    variant="rustig"
                    onClick={() => {
                      setDuplicaten(null)
                      setNieuwOpen(false)
                      navigate(`/deelnemers/${dubbel.id}`)
                    }}
                  >
                    Dit is dezelfde persoon
                  </Knop>
                </div>
              </li>
            ))}
          </ul>
        </Bevestig>
      )}
    </div>
  )
}
