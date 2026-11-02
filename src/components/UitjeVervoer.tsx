import { useState } from "react"
import { api, foutTekst } from "../api"
import { Badge, Invoer, Knop, Melding, Select, Tabel, Veld } from "./ui"

export type GekoppeldVoertuig = {
  id: number
  naam: string
  kenteken: string | null
  capaciteit: number
  chauffeur_id: number | null
  chauffeur_naam: string | null
  begeleider_id: number | null
  begeleider_naam: string | null
}

export type VoertuigOptie = {
  id: number
  naam: string
  kenteken: string | null
  capaciteit: number
  actief?: boolean
}

export type Persoon = { id: number; naam: string }

/** Voertuig, chauffeur en begeleider koppelen aan één uitje, direct vanuit het programma. */
export function UitjeVervoer({
  uitjeId,
  gekoppeld,
  voertuigen,
  chauffeurs,
  medewerkers,
  magWijzigen,
  gewijzigd,
}: {
  uitjeId: number
  gekoppeld: GekoppeldVoertuig[]
  voertuigen: VoertuigOptie[]
  chauffeurs: Persoon[]
  medewerkers: Persoon[]
  magWijzigen: boolean
  gewijzigd: () => Promise<void> | void
}) {
  const [keuze, setKeuze] = useState({ voertuig: "", chauffeur: "", begeleider: "" })
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function koppel() {
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ waarschuwing?: string; bericht: string }>(
        `/periodes/uitje/${uitjeId}/voertuigen`,
        {
          method: "POST",
          body: JSON.stringify({
            voertuig_id: Number(keuze.voertuig),
            chauffeur_id: keuze.chauffeur ? Number(keuze.chauffeur) : null,
            begeleider_id: keuze.begeleider ? Number(keuze.begeleider) : null,
          }),
        },
      )
      setMelding(antwoord.waarschuwing ?? antwoord.bericht)
      setKeuze({ voertuig: "", chauffeur: "", begeleider: "" })
      await gewijzigd()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function verwijder(koppelingId: number) {
    setBezig(true)
    setFout(null)
    try {
      await api(`/periodes/uitje-voertuig/${koppelingId}`, { method: "DELETE" })
      setMelding(null)
      await gewijzigd()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="vervoer-paneel">
      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && <Melding type="info">{melding}</Melding>}

      {gekoppeld.length === 0 ? (
        <p className="muted">Nog geen voertuig gekoppeld aan dit uitje.</p>
      ) : (
        <Tabel kolommen={["Voertuig", "Plekken", "Chauffeur", "Begeleider", ""]}>
          {gekoppeld.map((voertuig) => (
            <tr key={voertuig.id}>
              <td>
                {voertuig.naam}
                {voertuig.kenteken && <div className="klein muted">{voertuig.kenteken}</div>}
              </td>
              <td className="getal">{voertuig.capaciteit}</td>
              <td>{voertuig.chauffeur_naam ?? <Badge toon="waarschuwing">nog niet toegewezen</Badge>}</td>
              <td>{voertuig.begeleider_naam ?? <Badge toon="waarschuwing">nog niet toegewezen</Badge>}</td>
              <td className="rechts">
                {magWijzigen && (
                  <Knop variant="rustig" onClick={() => void verwijder(voertuig.id)} disabled={bezig}>
                    Weghalen
                  </Knop>
                )}
              </td>
            </tr>
          ))}
        </Tabel>
      )}

      {magWijzigen && (
        <div className="rij marge-boven">
          <Select
            value={keuze.voertuig}
            onChange={(e) => setKeuze({ ...keuze, voertuig: e.target.value })}
            aria-label="Voertuig kiezen"
          >
            <option value="">Voertuig kiezen…</option>
            {voertuigen.map((voertuig) => (
              <option key={voertuig.id} value={voertuig.id}>
                {voertuig.naam}
                {voertuig.kenteken ? ` (${voertuig.kenteken})` : ""} · {voertuig.capaciteit} plekken
              </option>
            ))}
          </Select>
          <Select
            value={keuze.chauffeur}
            onChange={(e) => setKeuze({ ...keuze, chauffeur: e.target.value })}
            aria-label="Chauffeur kiezen"
          >
            <option value="">Chauffeur kiezen…</option>
            {chauffeurs.map((chauffeur) => (
              <option key={chauffeur.id} value={chauffeur.id}>
                {chauffeur.naam}
              </option>
            ))}
          </Select>
          <Select
            value={keuze.begeleider}
            onChange={(e) => setKeuze({ ...keuze, begeleider: e.target.value })}
            aria-label="Begeleider kiezen"
          >
            <option value="">Begeleider kiezen…</option>
            {medewerkers.map((medewerker) => (
              <option key={medewerker.id} value={medewerker.id}>
                {medewerker.naam}
              </option>
            ))}
          </Select>
          <Knop onClick={() => void koppel()} disabled={bezig || !keuze.voertuig}>
            Koppelen
          </Knop>
        </div>
      )}
    </div>
  )
}

/** De busjes en auto's zelf: kenteken en aantal plekken. */
export function VoertuigenBeheer({
  voertuigen,
  magToevoegen,
  gewijzigd,
}: {
  voertuigen: VoertuigOptie[]
  magToevoegen: boolean
  gewijzigd: () => Promise<void> | void
}) {
  const [velden, setVelden] = useState({ naam: "", kenteken: "", capaciteit: "7" })
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function toevoegen() {
    setBezig(true)
    setFout(null)
    try {
      await api("/voertuigen", {
        method: "POST",
        body: JSON.stringify({
          naam: velden.naam,
          kenteken: velden.kenteken,
          capaciteit: Number(velden.capaciteit),
        }),
      })
      setVelden({ naam: "", kenteken: "", capaciteit: "7" })
      await gewijzigd()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      {fout && <Melding type="fout">{fout}</Melding>}
      <Tabel kolommen={["Voertuig", "Kenteken", "Plekken", "In gebruik"]}>
        {voertuigen.map((voertuig) => (
          <tr key={voertuig.id}>
            <td>{voertuig.naam}</td>
            <td className="nu">{voertuig.kenteken ?? <span className="muted">—</span>}</td>
            <td className="getal">{voertuig.capaciteit}</td>
            <td>{voertuig.actief === false ? "nee" : "ja"}</td>
          </tr>
        ))}
      </Tabel>
      {magToevoegen && (
        <div className="rij marge-boven">
          <Veld label="Naam" hint="Zoals jullie het busje noemen.">
            <Invoer
              value={velden.naam}
              onChange={(e) => setVelden({ ...velden, naam: e.target.value })}
              placeholder="Bijvoorbeeld: Busje 3"
            />
          </Veld>
          <Veld label="Kenteken" hint="Met of zonder streepjes.">
            <Invoer
              value={velden.kenteken}
              onChange={(e) => setVelden({ ...velden, kenteken: e.target.value })}
              placeholder="Bijvoorbeeld: 12-ABC-3"
            />
          </Veld>
          <Veld label="Plekken">
            <Invoer
              inputMode="numeric"
              value={velden.capaciteit}
              onChange={(e) => setVelden({ ...velden, capaciteit: e.target.value })}
            />
          </Veld>
          <Knop onClick={() => void toevoegen()} disabled={bezig || !velden.naam}>
            Voertuig toevoegen
          </Knop>
        </div>
      )}
    </>
  )
}
