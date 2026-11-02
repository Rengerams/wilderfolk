import { useState } from "react"
import { api, bestandAlsBase64, foutTekst } from "../api"
import { Badge, Invoer, Knop, Melding, Modal, Tabel, Veld } from "./ui"
import { datumNumeriek } from "../lib/format"

type BezoekRegel = {
  rij: number
  datum: string
  omschrijving: string
  deelnemer: string
  fout: string | null
}

type ImportGroep = {
  datum: string
  omschrijving: string
  deelnemers: { id: number; naam: string }[]
  bestond: boolean
}

type Controle = {
  regels: BezoekRegel[]
  groepen: ImportGroep[]
  aantal: number
  ongeldig: number
  deelnemers: number
  nieuwe_uitjes: number
  bestaande_uitjes: number
}

/** Bezoekgeschiedenis uit het oude systeem inladen: één regel per bezoek. */
export function GeschiedenisImport({
  sluiten,
  klaar,
}: {
  sluiten: () => void
  klaar: (bericht: string) => void
}) {
  const [bestand, setBestand] = useState<File | null>(null)
  const [controle, setControle] = useState<Controle | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function controleer() {
    if (!bestand) return
    setBezig(true)
    setFout(null)
    try {
      const inhoud = await bestandAlsBase64(bestand)
      setControle(
        await api<Controle>("/deelnemers/import/geschiedenis", {
          method: "POST",
          body: JSON.stringify({ bestand: inhoud, bestandsnaam: bestand.name }),
        }),
      )
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function bevestig() {
    if (!controle) return
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ bericht: string }>("/deelnemers/import/geschiedenis/bevestig", {
        method: "POST",
        body: JSON.stringify({ groepen: controle.groepen }),
      })
      klaar(antwoord.bericht)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  const teImporteren = controle ? controle.aantal - controle.ongeldig : 0

  return (
    <Modal
      titel="Bezoekgeschiedenis inladen uit Excel of CSV"
      uitleg="Zo neem je over wie er in het oude systeem met welke uitjes mee is geweest."
      sluiten={sluiten}
      breed
      acties={
        controle ? (
          <>
            <Knop onClick={() => setControle(null)}>Terug</Knop>
            <Knop
              variant="primair"
              onClick={() => void bevestig()}
              disabled={bezig || teImporteren === 0}
            >
              {bezig ? "Opslaan…" : `Ja, ${teImporteren} bezoeken opslaan`}
            </Knop>
          </>
        ) : (
          <>
            <Knop onClick={sluiten}>Annuleren</Knop>
            <Knop variant="primair" onClick={() => void controleer()} disabled={bezig || !bestand}>
              {bezig ? "Controleren…" : "Bestand controleren"}
            </Knop>
          </>
        )
      }
    >
      {fout && <Melding type="fout">{fout}</Melding>}

      {controle ? (
        <>
          <Melding type={controle.ongeldig > 0 ? "waarschuwing" : "succes"}>
            Dit worden <strong>{teImporteren} bezoeken</strong> van{" "}
            <strong>{controle.deelnemers} deelnemers</strong> in{" "}
            {controle.nieuwe_uitjes + controle.bestaande_uitjes} uitjes. Klopt dat?
            {controle.ongeldig > 0 &&
              ` ${controle.ongeldig} regel(s) worden overgeslagen, bijvoorbeeld omdat de deelnemer nog niet in het systeem staat.`}
          </Melding>
          <Tabel compact kolommen={["Rij", "Datum", "Uitje", "Deelnemer", "Opmerking"]}>
            {controle.regels.slice(0, 25).map((regel) => (
              <tr key={regel.rij}>
                <td>{regel.rij}</td>
                <td className="nu">
                  {regel.datum ? datumNumeriek(regel.datum) : <span className="muted">{regel.datum || "—"}</span>}
                </td>
                <td>{regel.omschrijving}</td>
                <td>{regel.deelnemer || <span className="muted">—</span>}</td>
                <td>
                  {regel.fout ? (
                    <span className="klein" style={{ color: "var(--fout)" }}>
                      {regel.fout}
                    </span>
                  ) : (
                    <Badge toon="goed">in orde</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Tabel>
          {controle.regels.length > 25 && (
            <p className="klein muted">En nog {controle.regels.length - 25} regels.</p>
          )}
        </>
      ) : (
        <>
          <Veld label="Bestand" hint="Excel (.xlsx) of CSV.">
            <Invoer
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
            />
          </Veld>
          <Melding type="info">
            Zet in de bovenste regel de kolomnamen: datum, omschrijving en naam (of voornaam en achternaam).
            Een telefoonnummer mag er ook bij staan; daarmee wordt de deelnemer zeker herkend. Laad eerst de
            deelnemers in. Er wordt pas opgeslagen als je bevestigt.
          </Melding>
        </>
      )}
    </Modal>
  )
}
