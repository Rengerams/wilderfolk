import { useState } from "react"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import { Invoer, Kaart, Knop, Melding, PaginaKop } from "../components/ui"

type Bericht = { van: "gebruiker" | "assistent"; tekst: string }

export function Assistent() {
  const { moduleAan } = useAuth()
  const [vraag, setVraag] = useState("")
  const [berichten, setBerichten] = useState<Bericht[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  if (!moduleAan("ai_assistent")) {
    return (
      <Kaart titel="De AI-assistent staat uit">
        <p>
          De beheerder kan de assistent aanzetten bij Modules. De assistent beantwoordt alleen vragen over het
          programma en krijgt nooit persoonsgegevens te zien.
        </p>
      </Kaart>
    )
  }

  async function stel() {
    const tekst = vraag.trim()
    if (!tekst) return
    setBezig(true)
    setFout(null)
    setBerichten((huidig) => [...huidig, { van: "gebruiker", tekst }])
    setVraag("")
    try {
      const antwoord = await api<{ antwoord: string }>("/assistent", {
        method: "POST",
        body: JSON.stringify({ vraag: tekst }),
      })
      setBerichten((huidig) => [...huidig, { van: "assistent", tekst: antwoord.antwoord }])
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <div>
      <PaginaKop
        titel="Assistent"
        stap="Stel je vraag over het programma. De assistent ziet geen persoonsgegevens."
        uitleg="Vraag bijvoorbeeld: wanneer is de Efteling, wat kost het, of welke uitjes zijn er in december? De assistent ziet alleen het programma."
      />
      {fout && <Melding type="fout">{fout}</Melding>}

      <Kaart>
        <div className="lijst">
          {berichten.length === 0 && (
            <p className="muted">
              Nog geen vragen. De assistent kent alleen de uitjes van de periodes in het systeem: datum, tijd,
              omschrijving, prijs en plekken.
            </p>
          )}
          {berichten.map((bericht, index) => (
            <div
              key={index}
              className="lijst-item"
              style={{
                background: bericht.van === "gebruiker" ? "var(--primair-licht)" : "var(--oppervlak)",
              }}
            >
              <div className="klein muted">{bericht.van === "gebruiker" ? "Jij" : "Assistent"}</div>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{bericht.tekst}</p>
            </div>
          ))}
        </div>
        <div className="rij marge-boven">
          <Invoer
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
            placeholder="Bijvoorbeeld: wanneer is het museum?"
            onKeyDown={(e) => {
              if (e.key === "Enter") void stel()
            }}
          />
          <Knop variant="primair" onClick={() => void stel()} disabled={bezig || !vraag.trim()}>
            {bezig ? "Denken…" : "Vraag stellen"}
          </Knop>
        </div>
        <p className="klein muted marge-boven">
          De assistent ziet nooit namen, telefoonnummers, adressen of opmerkingen van deelnemers.
        </p>
      </Kaart>
    </div>
  )
}
