import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import { Badge, Kaart, Laad, Melding, PaginaKop, Select, Tabel } from "../components/ui"

type FeedbackRij = {
  id: number
  scherm: string
  tekst: string
  gebruiker_naam: string | null
  status: string
  created_at: string
}

export function Feedback() {
  const { mag } = useAuth()
  const [rijen, setRijen] = useState<FeedbackRij[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [filter, setFilter] = useState("nieuw")

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<{ feedback: FeedbackRij[] }>("/feedback")
      setRijen(antwoord.feedback)
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

  async function zetStatus(id: number, status: string) {
    try {
      await api(`/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      setMelding("De melding is bijgewerkt.")
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    }
  }

  if (laden) return <Laad />

  const zichtbaar = filter === "alles" ? rijen : rijen.filter((rij) => rij.status === filter)

  return (
    <div>
      <PaginaKop
        titel="Feedback van vrijwilligers"
        stap="Bekijk nieuwe meldingen en zet ze op 'in behandeling' of 'afgehandeld'."
        uitleg="Elke melding komt van een knop op het scherm waar de vrijwilliger stond. Zo is zichtbaar dat er iets mee gebeurt."
        acties={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter op status">
            <option value="nieuw">Nieuw</option>
            <option value="in_behandeling">In behandeling</option>
            <option value="afgehandeld">Afgehandeld</option>
            <option value="alles">Alles</option>
          </Select>
        }
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}

      {zichtbaar.length === 0 ? (
        <div className="leeg">
          <p className="leeg__titel">Geen meldingen met deze status</p>
          <p className="leeg__uitleg">Vrijwilligers kunnen op elk scherm op de feedbackknop drukken.</p>
        </div>
      ) : (
        <div className="lijst">
          {zichtbaar.map((rij) => (
            <Kaart key={rij.id}>
              <div className="lijst-item__kop">
                <div>
                  <Badge
                    toon={rij.status === "nieuw" ? "waarschuwing" : rij.status === "afgehandeld" ? "goed" : "info"}
                  >
                    {rij.status.replace("_", " ")}
                  </Badge>
                  <span className="klein muted"> {rij.scherm}</span>
                </div>
                <span className="klein muted">
                  {rij.gebruiker_naam ?? "Onbekend"} · {new Date(rij.created_at).toLocaleString("nl-NL")}
                </span>
              </div>
              <p style={{ marginTop: "0.6rem" }}>{rij.tekst}</p>
              {mag("feedback", "wijzigen") && (
                <div className="rij">
                  <Select
                    value={rij.status}
                    onChange={(e) => void zetStatus(rij.id, e.target.value)}
                    aria-label="Status van deze melding"
                  >
                    <option value="nieuw">Nieuw</option>
                    <option value="in_behandeling">In behandeling</option>
                    <option value="afgehandeld">Afgehandeld</option>
                  </Select>
                </div>
              )}
            </Kaart>
          ))}
        </div>
      )}

      <Kaart titel="Samenvatting">
        <Tabel kolommen={["Status", "Aantal"]}>
          {["nieuw", "in_behandeling", "afgehandeld"].map((status) => (
            <tr key={status}>
              <td>{status.replace("_", " ")}</td>
              <td className="getal">{rijen.filter((rij) => rij.status === status).length}</td>
            </tr>
          ))}
        </Tabel>
      </Kaart>
    </div>
  )
}
