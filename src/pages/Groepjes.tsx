import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import {
  Bevestig,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  Modal,
  PaginaKop,
  Veld,
} from "../components/ui"
import { volledigeNaam } from "../lib/format"
import type { Deelnemer, Groepje } from "../types"

export function Groepjes() {
  const { mag } = useAuth()
  const [groepjes, setGroepjes] = useState<Groepje[]>([])
  const [deelnemers, setDeelnemers] = useState<Deelnemer[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bewerk, setBewerk] = useState<Groepje | "nieuw" | null>(null)
  const [naam, setNaam] = useState("")
  const [leden, setLeden] = useState<number[]>([])
  const [bezig, setBezig] = useState(false)
  const [ontbind, setOntbind] = useState<Groepje | null>(null)

  async function haal() {
    setLaden(true)
    try {
      const [groepen, mensen] = await Promise.all([
        api<{ groepjes: Groepje[] }>("/groepjes"),
        api<{ deelnemers: Deelnemer[] }>("/deelnemers?status=actief"),
      ])
      setGroepjes(groepen.groepjes)
      setDeelnemers(mensen.deelnemers)
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

  function openBewerk(groepje: Groepje | "nieuw") {
    setBewerk(groepje)
    setNaam(groepje === "nieuw" ? "" : groepje.naam)
    setLeden(groepje === "nieuw" ? [] : groepje.leden.map((lid) => lid.id))
  }

  async function opslaan() {
    if (bewerk === null) return
    setBezig(true)
    setFout(null)
    try {
      if (bewerk === "nieuw") {
        await api("/groepjes", { method: "POST", body: JSON.stringify({ naam, leden }) })
        setMelding(`Groepje "${naam}" is aangemaakt.`)
      } else {
        await api(`/groepjes/${bewerk.id}`, {
          method: "PATCH",
          body: JSON.stringify({ naam, leden }),
        })
        setMelding(`Groepje "${naam}" is bijgewerkt.`)
      }
      setBewerk(null)
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function ontbinden() {
    if (!ontbind) return
    setBezig(true)
    try {
      await api(`/groepjes/${ontbind.id}`, {
        method: "DELETE",
        body: JSON.stringify({ bevestig: true }),
      })
      setMelding(`Groepje "${ontbind.naam}" is ontbonden. De deelnemers blijven bestaan.`)
      setOntbind(null)
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  const bezet = new Set(
    groepjes
      .filter((groepje) => bewerk === "nieuw" || bewerk?.id !== groepje.id)
      .flatMap((groepje) => groepje.leden.map((lid) => lid.id)),
  )
  const kandidaten = deelnemers.filter((deelnemer) => !bezet.has(deelnemer.id))

  if (laden) return <Laad />

  return (
    <div>
      <PaginaKop
        titel="Groepjes"
        stap="Maak een groepje of voeg een deelnemer toe."
        uitleg="Een groepje blijft bestaan en wordt bij de opgave en de indeling als geheel behandeld. Iemand zit in maximaal één groepje."
        acties={
          mag("groepjes", "aanmaken") ? (
            <Knop variant="primair" onClick={() => openBewerk("nieuw")}>
              Nieuw groepje
            </Knop>
          ) : undefined
        }
      />

      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {fout && <Melding type="fout">{fout}</Melding>}

      {groepjes.length === 0 ? (
        <div className="leeg">
          <p className="leeg__titel">Nog geen groepjes</p>
          <p className="leeg__uitleg">
            Maak een groepje als twee of meer deelnemers altijd samen meegaan. Bij de telefonische opgave wordt
            het groepje dan automatisch meegenomen.
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {groepjes.map((groepje) => (
            <Kaart
              key={groepje.id}
              titel={groepje.naam}
              uitleg={`${groepje.leden.length} deelnemers`}
              acties={
                <>
                  {mag("groepjes", "wijzigen") && (
                    <Knop onClick={() => openBewerk(groepje)}>Wijzigen</Knop>
                  )}
                  {mag("groepjes", "verwijderen") && (
                    <Knop variant="gevaar" onClick={() => setOntbind(groepje)}>
                      Ontbinden
                    </Knop>
                  )}
                </>
              }
            >
              <ul className="lijst">
                {groepje.leden.map((lid) => (
                  <li key={lid.id} className="lijst-item">
                    <div className="lijst-item__kop">
                      <Link to={`/deelnemers/${lid.id}`}>{volledigeNaam(lid)}</Link>
                      <span className="klein muted">{lid.telefoon ?? "geen telefoon"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Kaart>
          ))}
        </div>
      )}

      {bewerk !== null && (
        <Modal
          titel={bewerk === "nieuw" ? "Nieuw groepje" : `Groepje ${bewerk.naam} wijzigen`}
          uitleg="Kies de deelnemers die altijd samen meegaan. Iemand kan maar in één groepje zitten."
          sluiten={() => setBewerk(null)}
          breed
          acties={
            <>
              <Knop onClick={() => setBewerk(null)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void opslaan()} disabled={bezig || !naam.trim()}>
                {bezig ? "Opslaan…" : "Opslaan"}
              </Knop>
            </>
          }
        >
          <Veld label="Naam van het groepje" verplicht>
            <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} autoFocus />
          </Veld>
          <p className="veld__label">Deelnemers</p>
          <div className="lijst">
            {kandidaten.length === 0 && <p className="muted">Geen beschikbare deelnemers.</p>}
            {kandidaten.map((deelnemer) => (
              <label key={deelnemer.id} className="vinkje">
                <input
                  type="checkbox"
                  checked={leden.includes(deelnemer.id)}
                  onChange={(e) =>
                    setLeden((huidig) =>
                      e.target.checked
                        ? [...huidig, deelnemer.id]
                        : huidig.filter((lid) => lid !== deelnemer.id),
                    )
                  }
                />
                <span>
                  {volledigeNaam(deelnemer)}
                  <span className="klein muted"> — {deelnemer.telefoon ?? "geen telefoon"}</span>
                </span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {ontbind && (
        <Bevestig
          titel={`Groepje "${ontbind.naam}" ontbinden?`}
          uitleg="De deelnemers blijven gewoon bestaan en worden voortaan los behandeld. Dit kan niet ongedaan worden gemaakt."
          bevestigLabel="Ja, groepje ontbinden"
          gevaar
          bezig={bezig}
          bevestig={() => void ontbinden()}
          annuleer={() => setOntbind(null)}
        />
      )}
    </div>
  )
}
