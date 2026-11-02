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
  PaginaKop,
  Select,
  Tabel,
  Veld,
} from "../components/ui"
import { datumNumeriek, euro } from "../lib/format"

type KasData = {
  afsluitingen: {
    id: number
    uitje_id: number
    verwacht: number
    geteld: number
    verschil: number
    datum: string
    opmerking: string | null
    omschrijving: string
    geteld_door_naam: string | null
  }[]
  stortingen: { id: number; datum: string; bedrag: number; omschrijving: string | null; door_naam: string | null }[]
  saldo: number
  grens: number
  waarschuwing: boolean
}

export function Kas() {
  const { mag, moduleAan } = useAuth()
  const [data, setData] = useState<KasData | null>(null)
  const [uitjes, setUitjes] = useState<{ id: number; omschrijving: string; datum: string }[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [afsluiting, setAfsluiting] = useState({ uitje_id: "", verwacht: "", geteld: "", opmerking: "" })
  const [storting, setStorting] = useState({ datum: new Date().toISOString().slice(0, 10), bedrag: "", omschrijving: "" })

  async function haal() {
    setLaden(true)
    try {
      const [kas, declaraties] = await Promise.all([
        api<KasData>("/declaraties/kas/overzicht"),
        api<{ uitjes: { id: number; omschrijving: string; datum: string }[] }>("/declaraties"),
      ])
      setData(kas)
      setUitjes(declaraties.uitjes)
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

  async function sluitKas() {
    setBezig(true)
    try {
      await api("/declaraties/kas/afsluiting", {
        method: "POST",
        body: JSON.stringify({
          uitje_id: Number(afsluiting.uitje_id),
          verwacht: Number(afsluiting.verwacht.replace(",", ".")) || 0,
          geteld: Number(afsluiting.geteld.replace(",", ".")) || 0,
          opmerking: afsluiting.opmerking,
        }),
      })
      setMelding("De kasafsluiting is vastgelegd.")
      setAfsluiting({ uitje_id: "", verwacht: "", geteld: "", opmerking: "" })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function voegStortingToe() {
    setBezig(true)
    try {
      await api("/declaraties/kas/storting", {
        method: "POST",
        body: JSON.stringify({
          datum: storting.datum,
          bedrag: Number(storting.bedrag.replace(",", ".")),
          omschrijving: storting.omschrijving,
        }),
      })
      setMelding("De storting is vastgelegd.")
      setStorting({ datum: new Date().toISOString().slice(0, 10), bedrag: "", omschrijving: "" })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (!moduleAan("kas")) {
    return (
      <Kaart titel="De module Kas staat uit">
        <p>
          De beheerder kan de module Kas aanzetten bij Modules. Dat kan alleen als Chauffeurskosten ook aan staat.
          Zolang de module uit is, blijven eerdere kasgegevens bewaard.
        </p>
      </Kaart>
    )
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  return (
    <div>
      <PaginaKop
        titel="Kas"
        stap="Sluit na het uitje de kas af en leg stortingen vast."
        uitleg="Sluit na elk uitje de kas af, leg stortingen vast en houd zicht op het contante geld op kantoor."
      />

      {fout && <Melding type="fout">{fout}</Melding>}
      {melding && (
        <Melding type="succes" actie={{ label: "Sluiten", onClick: () => setMelding(null) }}>
          {melding}
        </Melding>
      )}
      {data.waarschuwing && (
        <Melding type="waarschuwing" titel="Veel contant geld op kantoor">
          Het saldo ({euro(data.saldo)}) is hoger dan de ingestelde grens van {euro(data.grens)}. Overweeg een
          extra storting of ophaling. Dit is een organisatiekeuze, geen systeemfout.
        </Melding>
      )}

      <div className="grid-3">
        <div className="stat">
          <div className="stat__waarde">{euro(data.saldo)}</div>
          <div className="stat__label">saldo contant geld op kantoor</div>
        </div>
        <div className="stat">
          <div className="stat__waarde">{euro(data.grens)}</div>
          <div className="stat__label">waarschuwingsgrens</div>
        </div>
        <div className="stat">
          <div className="stat__waarde">{data.afsluitingen.length}</div>
          <div className="stat__label">kasafsluitingen vastgelegd</div>
        </div>
      </div>

      {mag("kas", "aanmaken") && (
        <div className="grid-2">
          <Kaart titel="Kas afsluiten na een uitje" uitleg="Vul in wat er volgens de administratie in het bakje zat en wat er geteld is.">
            {uitjes.length === 0 ? (
              <p className="muted">Er zijn nog geen uitjes om af te sluiten.</p>
            ) : (
              <>
                <Veld label="Uitje" verplicht>
                  <Select
                    value={afsluiting.uitje_id}
                    onChange={(e) => setAfsluiting({ ...afsluiting, uitje_id: e.target.value })}
                  >
                    <option value="">Kies een uitje…</option>
                    {uitjes.map((uitje) => (
                      <option key={uitje.id} value={uitje.id}>
                        {datumNumeriek(uitje.datum)} · {uitje.omschrijving}
                      </option>
                    ))}
                  </Select>
                </Veld>
                <div className="grid-2">
                  <Veld label="Verwacht bedrag (€)">
                    <Invoer
                      inputMode="decimal"
                      value={afsluiting.verwacht}
                      onChange={(e) => setAfsluiting({ ...afsluiting, verwacht: e.target.value })}
                    />
                  </Veld>
                  <Veld label="Geteld bedrag (€)">
                    <Invoer
                      inputMode="decimal"
                      value={afsluiting.geteld}
                      onChange={(e) => setAfsluiting({ ...afsluiting, geteld: e.target.value })}
                    />
                  </Veld>
                </div>
                <Veld label="Opmerking">
                  <Invoer
                    value={afsluiting.opmerking}
                    onChange={(e) => setAfsluiting({ ...afsluiting, opmerking: e.target.value })}
                    placeholder="Bijvoorbeeld: klein verschil afgerond"
                  />
                </Veld>
                <Knop variant="primair" onClick={() => void sluitKas()} disabled={bezig || !afsluiting.uitje_id}>
                  Kasafsluiting opslaan
                </Knop>
              </>
            )}
          </Kaart>

          <Kaart titel="Storting vastleggen" uitleg="Leg datum en bedrag vast van elke storting naar de bank.">
            <div className="grid-2">
              <Veld label="Datum">
                <Invoer
                  type="date"
                  value={storting.datum}
                  onChange={(e) => setStorting({ ...storting, datum: e.target.value })}
                />
              </Veld>
              <Veld label="Bedrag (€)">
                <Invoer
                  inputMode="decimal"
                  value={storting.bedrag}
                  onChange={(e) => setStorting({ ...storting, bedrag: e.target.value })}
                />
              </Veld>
            </div>
            <Veld label="Omschrijving">
              <Invoer
                value={storting.omschrijving}
                onChange={(e) => setStorting({ ...storting, omschrijving: e.target.value })}
              />
            </Veld>
            <Knop variant="primair" onClick={() => void voegStortingToe()} disabled={bezig || !storting.bedrag}>
              Storting opslaan
            </Knop>
          </Kaart>
        </div>
      )}

      <Kaart titel="Kasafsluitingen" uitleg="Het verschil wordt automatisch afgerond op twee decimalen.">
        {data.afsluitingen.length === 0 ? (
          <p className="muted">Nog geen kasafsluitingen.</p>
        ) : (
          <Tabel
            kolommen={["Datum", "Uitje", { tekst: "Verwacht", getal: true }, { tekst: "Geteld", getal: true }, { tekst: "Verschil", getal: true }, "Geteld door"]}
          >
            {data.afsluitingen.map((rij) => (
              <tr key={rij.id}>
                <td className="nu">{datumNumeriek(rij.datum)}</td>
                <td>{rij.omschrijving}</td>
                <td className="getal">{euro(rij.verwacht)}</td>
                <td className="getal">{euro(rij.geteld)}</td>
                <td className="getal">
                  {rij.verschil === 0 ? (
                    <Badge toon="goed">geen verschil</Badge>
                  ) : (
                    <Badge toon="waarschuwing">{euro(rij.verschil)}</Badge>
                  )}
                </td>
                <td>{rij.geteld_door_naam ?? "—"}</td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>

      <Kaart titel="Stortingen">
        {data.stortingen.length === 0 ? (
          <p className="muted">Nog geen stortingen vastgelegd.</p>
        ) : (
          <Tabel kolommen={["Datum", { tekst: "Bedrag", getal: true }, "Omschrijving", "Vastgelegd door"]}>
            {data.stortingen.map((rij) => (
              <tr key={rij.id}>
                <td className="nu">{datumNumeriek(rij.datum)}</td>
                <td className="getal">{euro(rij.bedrag)}</td>
                <td>{rij.omschrijving ?? "—"}</td>
                <td>{rij.door_naam ?? "—"}</td>
              </tr>
            ))}
          </Tabel>
        )}
      </Kaart>
    </div>
  )
}
