import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { Kaart, Laad, Melding, Schakelaar, Select, Veld } from "./ui"

type Gebruiker = { id: number; naam: string; email: string; rol_naam: string; actief: boolean }
type Functie = { sleutel: string; naam: string; uitleg: string; aan: boolean; globaal: boolean }

export function GebruikerFuncties({ kanWijzigen }: { kanWijzigen: boolean }) {
  const [gebruikers, setGebruikers] = useState<Gebruiker[]>([])
  const [gekozen, setGekozen] = useState("")
  const [functies, setFuncties] = useState<Functie[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)

  useEffect(() => {
    async function haalGebruikers() {
      try {
        const antwoord = await api<{ gebruikers: Gebruiker[] }>("/gebruikers")
        const lijst = antwoord.gebruikers.filter((g) => g.actief)
        setGebruikers(lijst)
        if (lijst.length > 0) setGekozen(String(lijst[0].id))
      } catch (e) {
        setFout(foutTekst(e))
      } finally {
        setLaden(false)
      }
    }
    void haalGebruikers()
  }, [])

  useEffect(() => {
    if (!gekozen) return
    async function haalFuncties() {
      try {
        const antwoord = await api<{ functies: Functie[] }>(`/gebruikers/${gekozen}/functies`)
        setFuncties(antwoord.functies)
        setFout(null)
      } catch (e) {
        setFout(foutTekst(e))
      }
    }
    void haalFuncties()
  }, [gekozen])

  async function zetFunctie(functie: Functie, aan: boolean) {
    setFout(null)
    setMelding(null)
    try {
      const antwoord = await api<{ bericht: string }>(`/gebruikers/${gekozen}/functies`, {
        method: "PATCH",
        body: JSON.stringify({ functie: functie.sleutel, aan }),
      })
      setFuncties((huidig) => huidig.map((rij) => (rij.sleutel === functie.sleutel ? { ...rij, aan } : rij)))
      setMelding(antwoord.bericht)
    } catch (e) {
      setFout(foutTekst(e))
    }
  }

  const persoon = gebruikers.find((g) => String(g.id) === gekozen)

  return (
    <Kaart
      titel="Functies per gebruiker"
      uitleg="Staat een functie algemeen aan, dan kun je hem per gebruiker alsnog uitzetten. Wat iemand niet gebruikt, ziet hij ook niet in het menu."
    >
      {laden ? (
        <Laad />
      ) : gebruikers.length === 0 ? (
        <Melding type="info">Er zijn nog geen actieve accounts.</Melding>
      ) : (
        <>
          <Veld label="Kies een gebruiker" hint="De instelling geldt alleen voor deze persoon.">
            <Select value={gekozen} onChange={(e) => setGekozen(e.target.value)}>
              {gebruikers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.naam} — {g.rol_naam}
                </option>
              ))}
            </Select>
          </Veld>

          {fout && <Melding type="fout">{fout}</Melding>}
          {melding && <Melding type="succes">{melding}</Melding>}

          <div className="lijst marge-boven">
            {functies.map((functie) => (
              <div key={functie.sleutel} className="lijst-item">
                <Schakelaar
                  aan={functie.aan}
                  aanzetten={(aan) => void zetFunctie(functie, aan)}
                  label={functie.naam}
                  uitleg={
                    functie.globaal
                      ? functie.uitleg
                      : `${functie.uitleg} (staat voor de hele organisatie uit)`
                  }
                  uitgeschakeld={!kanWijzigen || !functie.globaal}
                />
              </div>
            ))}
          </div>

          {persoon && (
            <p className="klein muted marge-boven--klein">
              Deze instellingen gelden voor {persoon.naam}. Rechten blijven via de rol ingesteld.
            </p>
          )}
        </>
      )}
    </Kaart>
  )
}
