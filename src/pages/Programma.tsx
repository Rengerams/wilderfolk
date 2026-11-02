import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Badge,
  Invoer,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Veld,
} from "../components/ui"
import { datumNumeriek } from "../lib/format"
import type { Periode } from "../types"

export function statusBadge(status: string) {
  if (status === "gepubliceerd") return <Badge toon="goed">Opgave open</Badge>
  if (status === "gesloten") return <Badge toon="info">Gesloten</Badge>
  return <Badge>Concept</Badge>
}

export function Programma() {
  const { mag } = useAuth()
  const [periodes, setPeriodes] = useState<Periode[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [nieuw, setNieuw] = useState(false)
  const [velden, setVelden] = useState({ naam: "", start_op: "", eind_op: "", aanmelddeadline: "" })
  const [bezig, setBezig] = useState(false)

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<{ periodes: Periode[] }>("/periodes")
      setPeriodes(antwoord.periodes)
      setFout(null)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
  }, [])

  async function opslaan() {
    setBezig(true)
    try {
      await api("/periodes", { method: "POST", body: JSON.stringify(velden) })
      setNieuw(false)
      setVelden({ naam: "", start_op: "", eind_op: "", aanmelddeadline: "" })
      await haal()
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
        titel="Programma"
        stap="Open de periode waaraan je wilt werken."
        uitleg="Elke periode heeft een eigen programma en aanmelddeadline. Open een periode om uitjes toe te voegen, te importeren of af te drukken."
        acties={
          mag("programma", "aanmaken") ? (
            <Knop variant="primair" onClick={() => setNieuw(true)}>
              Nieuwe periode
            </Knop>
          ) : undefined
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}

      {periodes.length === 0 ? (
        <div className="leeg">
          <p className="leeg__titel">Nog geen periodes</p>
          <p className="leeg__uitleg">
            Maak eerst een periode aan, bijvoorbeeld "januari – februari". Daarna voeg je de uitjes toe of
            importeer je het programmabestand.
          </p>
        </div>
      ) : (
        <div className="lijst">
          {periodes.map((periode) => (
            <div key={periode.id} className="lijst-item">
              <div className="lijst-item__kop">
                <div>
                  <h2 style={{ marginBottom: "0.2rem" }}>
                    <Link to={`/programma/${periode.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {periode.naam}
                    </Link>
                  </h2>
                  <div className="klein muted">
                    {datumNumeriek(periode.start_op)} tot {datumNumeriek(periode.eind_op)} · opgeven kan tot en
                    met {datumNumeriek(periode.aanmelddeadline)}
                  </div>
                </div>
                <div className="rij">
                  {statusBadge(periode.status)}
                  <Link className="knop knop--klein" to={`/programma/${periode.id}`}>
                    Openen
                  </Link>
                </div>
              </div>
              <div className="rij marge-boven--klein klein muted">
                <span>{periode.aantal_uitjes ?? 0} uitjes</span>
                <span>·</span>
                <span>{periode.aantal_opgaven ?? 0} opgaven</span>
                <span>·</span>
                <span>standaard {periode.standaard_capaciteit} plekken per uitje</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {nieuw && (
        <Modal
          titel="Nieuwe periode"
          uitleg="Meestal duurt een periode twee maanden. De aanmelddeadline is de laatste dag waarop deelnemers zich kunnen opgeven."
          sluiten={() => setNieuw(false)}
          acties={
            <>
              <Knop onClick={() => setNieuw(false)}>Annuleren</Knop>
              <Knop
                variant="primair"
                onClick={() => void opslaan()}
                disabled={bezig || !velden.start_op || !velden.eind_op || !velden.aanmelddeadline}
              >
                {bezig ? "Opslaan…" : "Periode aanmaken"}
              </Knop>
            </>
          }
        >
          <Veld label="Naam" hint="Laat leeg om de datums als naam te gebruiken.">
            <Invoer
              value={velden.naam}
              onChange={(e) => setVelden({ ...velden, naam: e.target.value })}
              placeholder="januari – februari 2027"
            />
          </Veld>
          <div className="grid-2">
            <Veld label="Eerste dag" verplicht>
              <Invoer
                type="date"
                value={velden.start_op}
                onChange={(e) => setVelden({ ...velden, start_op: e.target.value })}
              />
            </Veld>
            <Veld label="Laatste dag" verplicht>
              <Invoer
                type="date"
                value={velden.eind_op}
                onChange={(e) => setVelden({ ...velden, eind_op: e.target.value })}
              />
            </Veld>
          </div>
          <Veld label="Aanmelddeadline" verplicht>
            <Invoer
              type="date"
              value={velden.aanmelddeadline}
              onChange={(e) => setVelden({ ...velden, aanmelddeadline: e.target.value })}
            />
          </Veld>
        </Modal>
      )}
    </div>
  )
}
