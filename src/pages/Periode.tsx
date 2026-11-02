import { Fragment, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { api, bestandAlsBase64, download, foutTekst } from "../api"
import { useAuth } from "../auth"
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
  Veld,
} from "../components/ui"
import { PlekkenKeuze } from "../components/PlekkenKeuze"
import { ProgrammaKalender } from "../components/ProgrammaKalender"
import {
  UitjeVervoer,
  VoertuigenBeheer,
  type GekoppeldVoertuig,
  type Persoon,
  type VoertuigOptie,
} from "../components/UitjeVervoer"
import { datumKort, datumNumeriek, euro, tijd } from "../lib/format"
import type { Periode, Uitje } from "../types"
import { statusBadge } from "./Programma"

const LABELS = ["Nieuw", "Op herhaling", "Op veler verzoek", "Eenmalig", "Uitgelicht"]

type ImportRegel = {
  rij: number
  datum: string
  dagsleutel: string
  begin_tijd: string | null
  eind_tijd: string | null
  omschrijving: string
  prijs: number
  extra_kosten: string | null
  capaciteit: number
  labels: string[]
  fouten: string[]
  waarschuwingen: string[]
  reeks_sleutel: string | null
}

type VervoerData = {
  uitjes: { id: number; voertuigen: GekoppeldVoertuig[] }[]
  voertuigen: VoertuigOptie[]
  chauffeurs: Persoon[]
  medewerkers: Persoon[]
}

type PeriodeData = {
  periode: Periode
  uitjes: Uitje[]
  reeksen: { id: number; omschrijving: string }[]
  heeftDefinitieveIndeling: boolean
}

function leegUitje(capaciteit: number) {
  return {
    omschrijving: "",
    datums: [""],
    begin_tijd: "10:00",
    eind_tijd: "16:00",
    prijs: "0",
    extra_kosten: "",
    capaciteit: String(capaciteit),
    geschiktheid: "",
    labels: [] as string[],
  }
}

export function PeriodeDetail() {
  const { id } = useParams()
  const { mag } = useAuth()
  const [data, setData] = useState<PeriodeData | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ongedaan?: () => void } | null>(null)
  const [bezig, setBezig] = useState(false)
  const [weergave, setWeergave] = useState<"lijst" | "kalender">("lijst")
  const [vervoer, setVervoer] = useState<VervoerData | null>(null)
  const [openVervoer, setOpenVervoer] = useState<number | null>(null)

  const [nieuwUitje, setNieuwUitje] = useState(false)
  const [uitjeVelden, setUitjeVelden] = useState(leegUitje(14))
  const [wijzigPeriode, setWijzigPeriode] = useState(false)
  const [periodeVelden, setPeriodeVelden] = useState({ naam: "", start_op: "", eind_op: "", aanmelddeadline: "", standaard_capaciteit: "14" })
  const [statusBevestig, setStatusBevestig] = useState<"gepubliceerd" | "gesloten" | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [bestand, setBestand] = useState<File | null>(null)
  const [standaardCap, setStandaardCap] = useState("14")
  const [preview, setPreview] = useState<{ regels: ImportRegel[]; aantal: number; fouten: number } | null>(null)

  async function haalVervoer() {
    if (!mag("vervoer", "zien")) return
    try {
      setVervoer(await api<VervoerData>(`/periodes/${id}/vervoer`))
    } catch {
      setVervoer(null)
    }
  }

  async function haal() {
    setLaden(true)
    try {
      const antwoord = await api<PeriodeData>(`/periodes/${id}`)
      setData(antwoord)
      setPeriodeVelden({
        naam: antwoord.periode.naam,
        start_op: antwoord.periode.start_op.slice(0, 10),
        eind_op: antwoord.periode.eind_op.slice(0, 10),
        aanmelddeadline: antwoord.periode.aanmelddeadline.slice(0, 10),
        standaard_capaciteit: String(antwoord.periode.standaard_capaciteit),
      })
      setStandaardCap(String(antwoord.periode.standaard_capaciteit))
      setFout(null)
      void haalVervoer()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    void haal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function zetStatus(status: "gepubliceerd" | "gesloten") {
    setBezig(true)
    try {
      await api(`/periodes/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
      setStatusBevestig(null)
      setMelding({
        tekst:
          status === "gepubliceerd"
            ? "De opgave is geopend. Medewerkers kunnen nu opgaven invoeren."
            : "De periode is gesloten. De indeling kan nu worden gemaakt.",
        ongedaan: async () => {
          await api(`/periodes/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: status === "gepubliceerd" ? "concept" : "gepubliceerd" }),
          })
          setMelding(null)
          await haal()
        },
      })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function slaUitjeOp() {
    setBezig(true)
    setFout(null)
    try {
      const datums = uitjeVelden.datums.filter(Boolean)
      if (datums.length === 0 || !uitjeVelden.omschrijving.trim()) {
        setFout("Vul een omschrijving en minstens één datum in.")
        return
      }
      await api(`/periodes/${id}/uitjes`, {
        method: "POST",
        body: JSON.stringify({
          ...uitjeVelden,
          datums,
          prijs: Number(uitjeVelden.prijs.replace(",", ".")) || 0,
          capaciteit: Number(uitjeVelden.capaciteit) || data?.periode.standaard_capaciteit || 14,
        }),
      })
      setNieuwUitje(false)
      setUitjeVelden(leegUitje(data?.periode.standaard_capaciteit ?? 14))
      setMelding({ tekst: `Uitje "${uitjeVelden.omschrijving}" is toegevoegd.` })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function kopieer() {
    setBezig(true)
    try {
      const antwoord = await api<{ gekopieerd: number; overgeslagen: number }>(`/periodes/${id}/kopieer-vorige`, {
        method: "POST",
      })
      setMelding({
        tekst: `${antwoord.gekopieerd} uitjes gekopieerd${antwoord.overgeslagen ? `; ${antwoord.overgeslagen} vielen buiten deze periode` : ""}.`,
      })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function controleerImport() {
    if (!bestand) {
      setFout("Kies eerst een Excel- of CSV-bestand.")
      return
    }
    setBezig(true)
    setFout(null)
    try {
      const inhoud = await bestandAlsBase64(bestand)
      const antwoord = await api<{ regels: ImportRegel[]; aantal: number; fouten: number }>(
        `/periodes/${id}/import`,
        {
          method: "POST",
          body: JSON.stringify({
            bestand: inhoud,
            bestandsnaam: bestand.name,
            standaard_capaciteit: Number(standaardCap) || 14,
          }),
        },
      )
      setPreview(antwoord)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function bevestigImport() {
    if (!preview) return
    setBezig(true)
    try {
      const antwoord = await api<{ batch_id: number; aantal: number }>(`/periodes/${id}/import/bevestig`, {
        method: "POST",
        body: JSON.stringify({ regels: preview.regels }),
      })
      const batchId = antwoord.batch_id
      setPreview(null)
      setImportOpen(false)
      setBestand(null)
      setMelding({
        tekst: `${antwoord.aantal} uitjes ingeladen. Controleer het programma voordat je de opgave opent.`,
        ongedaan: async () => {
          await api(`/periodes/import/${batchId}/ongedaan`, { method: "POST" })
          setMelding(null)
          await haal()
        },
      })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function wijzigPeriodeOpslaan() {
    setBezig(true)
    try {
      await api(`/periodes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...periodeVelden,
          standaard_capaciteit: Number(periodeVelden.standaard_capaciteit) || 14,
        }),
      })
      setWijzigPeriode(false)
      setMelding({ tekst: "De periode is bijgewerkt." })
      await haal()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />
  if (fout && !data) return <Melding type="fout">{fout}</Melding>
  if (!data) return null

  const { periode, uitjes } = data
  const kanWijzigen = mag("programma", "wijzigen")
  const kanAanmaken = mag("programma", "aanmaken")

  return (
    <div>
      <div className="print-kop">
        <h1>Programma {periode.naam}</h1>
        <p>Stichting Diligence Almere · {datumNumeriek(periode.start_op)} tot {datumNumeriek(periode.eind_op)}</p>
      </div>

      <PaginaKop
        titel={periode.naam}
        stap={
          periode.status === "concept"
            ? "Voeg de uitjes toe en open daarna de opgave."
            : periode.status === "gepubliceerd"
              ? `Voer de opgaven in. Daarna sluit je de opgave en maak je de indeling.`
              : "Ga naar de indeling en bereken een eerlijk voorstel."
        }
        uitleg={
          periode.status === "concept"
            ? "Controleer de datums, tijden, prijzen en het aantal plekken."
            : periode.status === "gepubliceerd"
              ? `Mensen kunnen zich opgeven tot en met ${datumNumeriek(periode.aanmelddeadline)}.`
              : "De opgave is gesloten."
        }
        acties={
          <>
            <Link className="knop" to="/programma">
              Terug
            </Link>
            <Knop
              onClick={() =>
                void download(`/periodes/${periode.id}/export`, `programma-${periode.naam.replace(/\s+/g, "-")}.xlsx`)
              }
            >
              Export naar Excel
            </Knop>
            <Knop onClick={() => window.print()}>Afdrukken</Knop>
            {kanWijzigen && <Knop onClick={() => setWijzigPeriode(true)}>Periode wijzigen</Knop>}
          </>
        }
      />

      {melding && (
        <Melding
          type="succes"
          actie={
            melding.ongedaan
              ? { label: "Ongedaan maken", onClick: () => void melding.ongedaan?.() }
              : { label: "Sluiten", onClick: () => setMelding(null) }
          }
        >
          {melding.tekst}
        </Melding>
      )}
      {fout && <Melding type="fout">{fout}</Melding>}

      <Kaart>
        <div className="rij rij--tussen">
          <div className="rij">
            {statusBadge(periode.status)}
            <span className="klein muted">
              {datumNumeriek(periode.start_op)} tot {datumNumeriek(periode.eind_op)} · deadline{" "}
              {datumNumeriek(periode.aanmelddeadline)} · standaard {periode.standaard_capaciteit} plekken
            </span>
          </div>
          <div className="rij">
            {kanWijzigen && periode.status === "concept" && (
              <Knop variant="primair" onClick={() => setStatusBevestig("gepubliceerd")}>
                Opgave openen
              </Knop>
            )}
            {kanWijzigen && periode.status === "gepubliceerd" && (
              <Knop variant="primair" onClick={() => setStatusBevestig("gesloten")}>
                Opgave sluiten
              </Knop>
            )}
            {kanWijzigen && periode.status === "gesloten" && (
              <Knop onClick={() => setStatusBevestig("gepubliceerd")}>Opgave heropenen</Knop>
            )}
            {periode.status === "gesloten" && mag("indeling", "zien") && (
              <Link className="knop knop--primair" to={`/indeling/${periode.id}`}>
                Naar de indeling
              </Link>
            )}
          </div>
        </div>
      </Kaart>

      <Kaart
        titel={`Uitjes (${uitjes.length})`}
        uitleg="De volgorde is die van het programmablad: op datum en tijd."
        acties={
          <>
            {kanAanmaken && (
              <>
                <Knop variant="primair" onClick={() => setNieuwUitje(true)}>
                  Uitje toevoegen
                </Knop>
                <Knop onClick={() => setImportOpen(true)}>Importeren uit Excel</Knop>
                <Knop onClick={() => void kopieer()} disabled={bezig}>
                  Vorige periode kopiëren
                </Knop>
              </>
            )}
            <Knop
              onClick={() =>
                void download(`/periodes/${periode.id}/sjabloon`, "sjabloon-programma.xlsx")
              }
            >
              Leeg sjabloon
            </Knop>
            <div className="weergave-balk weergave-balk--in-kop" role="group" aria-label="Weergave van het programma">
              <button
                type="button"
                className={`weergave-tab${weergave === "lijst" ? " is-actief" : ""}`}
                onClick={() => setWeergave("lijst")}
                aria-pressed={weergave === "lijst"}
              >
                Lijst
              </button>
              <button
                type="button"
                className={`weergave-tab${weergave === "kalender" ? " is-actief" : ""}`}
                onClick={() => setWeergave("kalender")}
                aria-pressed={weergave === "kalender"}
              >
                Kalender
              </button>
            </div>
          </>
        }
      >
        {uitjes.length === 0 ? (
          <div className="leeg">
            <p className="leeg__titel">Nog geen uitjes</p>
            <p className="leeg__uitleg">
              Voeg een uitje toe, kopieer de vorige periode of importeer het programmabestand dat je al hebt.
              Een leeg sjabloon helpt daarbij.
            </p>
          </div>
        ) : weergave === "kalender" ? (
          <ProgrammaKalender uitjes={uitjes} start={periode.start_op} eind={periode.eind_op} />
        ) : (
          <Tabel
            kolommen={[
              "Datum",
              "Tijd",
              "Omschrijving",
              "Prijs",
              "Extra kosten",
              { tekst: "Plekken", getal: true },
              { tekst: "Opgaven", getal: true },
              "Labels",
              "",
            ]}
          >
            {uitjes.map((uitje) => (
              <Fragment key={uitje.id}>
              <tr style={uitje.status === "geannuleerd" ? { opacity: 0.6 } : undefined}>
                <td className="nu">
                  <strong>{datumKort(uitje.datum)}</strong>
                  <div className="klein muted">{datumNumeriek(uitje.datum)}</div>
                </td>
                <td className="nu">{tijd(uitje.begin_tijd, uitje.eind_tijd)}</td>
                <td>
                  <Link to={`/uitje/${uitje.id}`} className="tabel__naam">
                    {uitje.omschrijving}
                  </Link>
                  {uitje.reeks_id && <div className="klein muted">onderdeel van een reeks</div>}
                  {uitje.status === "geannuleerd" && <Badge toon="fout">geannuleerd</Badge>}
                </td>
                <td className="nu">{euro(uitje.prijs)}</td>
                <td>{uitje.extra_kosten ?? <span className="muted">—</span>}</td>
                <td className="getal">{uitje.capaciteit}</td>
                <td className="getal">{uitje.opgaven ?? 0}</td>
                <td>
                  {(uitje.labels ?? []).map((label) => (
                    <span key={label} className="tag">{label}</span>
                  ))}
                </td>
                <td className="rechts">
                  <Link className="knop knop--klein" to={`/uitje/${uitje.id}`}>
                    Openen
                  </Link>
                  {mag("vervoer", "zien") && (
                    <button
                      type="button"
                      className="knop knop--klein"
                      onClick={() => setOpenVervoer(openVervoer === uitje.id ? null : uitje.id)}
                    >
                      {openVervoer === uitje.id ? "Vervoer sluiten" : "Vervoer"}
                    </button>
                  )}
                </td>
              </tr>
              {openVervoer === uitje.id && vervoer && (
                <tr className="vervoer-rij">
                  <td colSpan={9}>
                    <UitjeVervoer
                      uitjeId={uitje.id}
                      gekoppeld={vervoer.uitjes.find((rij) => rij.id === uitje.id)?.voertuigen ?? []}
                      voertuigen={vervoer.voertuigen}
                      chauffeurs={vervoer.chauffeurs}
                      medewerkers={vervoer.medewerkers}
                      magWijzigen={mag("vervoer", "wijzigen")}
                      gewijzigd={haalVervoer}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </Tabel>
        )}
      </Kaart>

      {vervoer && (
        <Kaart
          titel="Voertuigen"
          uitleg="De busjes en auto's met hun kenteken en aantal plekken. Een voertuig kan niet dubbel geboekt worden op dezelfde dag."
        >
          <VoertuigenBeheer
            voertuigen={vervoer.voertuigen}
            magToevoegen={mag("vervoer", "aanmaken")}
            gewijzigd={haalVervoer}
          />
        </Kaart>
      )}

      {nieuwUitje && (
        <Modal
          titel="Uitje toevoegen"
          uitleg="Meerdere datums bij dezelfde omschrijving worden één reeks. Deelnemers kunnen dan kiezen voor alle data."
          sluiten={() => setNieuwUitje(false)}
          breed
          acties={
            <>
              <Knop onClick={() => setNieuwUitje(false)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void slaUitjeOp()} disabled={bezig}>
                {bezig ? "Opslaan…" : "Uitje opslaan"}
              </Knop>
            </>
          }
        >
          <Veld label="Omschrijving" verplicht>
            <Invoer
              value={uitjeVelden.omschrijving}
              onChange={(e) => setUitjeVelden({ ...uitjeVelden, omschrijving: e.target.value })}
              placeholder="Bijvoorbeeld: Pannenkoekhuis De Smickel"
              autoFocus
            />
          </Veld>
          <p className="veld__label">Datums</p>
          {uitjeVelden.datums.map((datum, index) => (
            <div key={index} className="rij marge-boven--klein">
              <Invoer
                type="date"
                value={datum}
                onChange={(e) => {
                  const datums = [...uitjeVelden.datums]
                  datums[index] = e.target.value
                  setUitjeVelden({ ...uitjeVelden, datums })
                }}
              />
              {uitjeVelden.datums.length > 1 && (
                <Knop
                  variant="rustig"
                  onClick={() =>
                    setUitjeVelden({
                      ...uitjeVelden,
                      datums: uitjeVelden.datums.filter((_, i) => i !== index),
                    })
                  }
                >
                  Datum verwijderen
                </Knop>
              )}
            </div>
          ))}
          <Knop
            variant="rustig"
            onClick={() => setUitjeVelden({ ...uitjeVelden, datums: [...uitjeVelden.datums, ""] })}
          >
            Nog een datum toevoegen
          </Knop>

          <div className="grid-2 marge-boven">
            <Veld label="Begintijd">
              <Invoer
                type="time"
                value={uitjeVelden.begin_tijd}
                onChange={(e) => setUitjeVelden({ ...uitjeVelden, begin_tijd: e.target.value })}
              />
            </Veld>
            <Veld label="Eindtijd">
              <Invoer
                type="time"
                value={uitjeVelden.eind_tijd}
                onChange={(e) => setUitjeVelden({ ...uitjeVelden, eind_tijd: e.target.value })}
              />
            </Veld>
            <Veld label="Prijs per persoon (€)">
              <Invoer
                inputMode="decimal"
                value={uitjeVelden.prijs}
                onChange={(e) => setUitjeVelden({ ...uitjeVelden, prijs: e.target.value })}
              />
            </Veld>
          </div>
          <PlekkenKeuze
            waarde={uitjeVelden.capaciteit}
            onChange={(waarde) => setUitjeVelden({ ...uitjeVelden, capaciteit: waarde })}
            hint="Laat de standaard staan als je het niet weet. Eén busje is 7 plekken, twee busjes 14 en een touringcar 40."
          />
          <Veld label="Extra kosten" hint="Bijvoorbeeld: Lunch / Consumptie. Dit is tekst, geen bedrag.">
            <Invoer
              value={uitjeVelden.extra_kosten}
              onChange={(e) => setUitjeVelden({ ...uitjeVelden, extra_kosten: e.target.value })}
            />
          </Veld>
          <Veld label="Geschiktheid" hint="Bijvoorbeeld: minder geschikt voor rollators. Het systeem waarschuwt dan bij de opgave.">
            <Invoer
              value={uitjeVelden.geschiktheid}
              onChange={(e) => setUitjeVelden({ ...uitjeVelden, geschiktheid: e.target.value })}
            />
          </Veld>
          <p className="veld__label">Labels</p>
          <div className="rij">
            {LABELS.map((label) => (
              <label key={label} className="vinkje">
                <input
                  type="checkbox"
                  checked={uitjeVelden.labels.includes(label)}
                  onChange={(e) =>
                    setUitjeVelden({
                      ...uitjeVelden,
                      labels: e.target.checked
                        ? [...uitjeVelden.labels, label]
                        : uitjeVelden.labels.filter((l) => l !== label),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal
          titel="Programma importeren uit Excel of CSV"
          uitleg="Het bestand mag de vorm hebben van het huidige programmablad: een maandkop (bijvoorbeeld NOVEMBER), daaronder regels als 'ma 02' en een tijd als '10:30-14:30'."
          sluiten={() => {
            setImportOpen(false)
            setPreview(null)
            setBestand(null)
          }}
          breed
          acties={
            preview ? (
              <>
                <Knop onClick={() => setPreview(null)}>Terug</Knop>
                <Knop variant="primair" onClick={() => void bevestigImport()} disabled={bezig}>
                  {bezig ? "Opslaan…" : `Ja, ${preview.aantal - preview.fouten} uitjes opslaan`}
                </Knop>
              </>
            ) : (
              <>
                <Knop onClick={() => setImportOpen(false)}>Annuleren</Knop>
                <Knop variant="primair" onClick={() => void controleerImport()} disabled={bezig || !bestand}>
                  {bezig ? "Controleren…" : "Bestand controleren"}
                </Knop>
              </>
            )
          }
        >
          {preview ? (
            <>
              <Melding type={preview.fouten > 0 ? "waarschuwing" : "succes"}>
                Dit worden <strong>{preview.aantal - preview.fouten} uitjes</strong>. Klopt dat?
                {preview.fouten > 0 && ` ${preview.fouten} regel(s) hebben een fout en worden niet opgeslagen.`}
              </Melding>
              <Tabel
                compact
                kolommen={["Rij", "Datum", "Tijd", "Omschrijving", "Prijs", "Plekken", "Opmerking"]}
              >
                {preview.regels.map((regel) => (
                  <tr key={regel.rij}>
                    <td>{regel.rij}</td>
                    <td className="nu">{datumNumeriek(regel.datum)}</td>
                    <td className="nu">{tijd(regel.begin_tijd, regel.eind_tijd)}</td>
                    <td>
                      {regel.omschrijving || <span className="muted">—</span>}
                      {regel.reeks_sleutel && <div className="klein muted">reeks: zelfde uitje op meerdere data</div>}
                    </td>
                    <td className="nu">{euro(regel.prijs)}</td>
                    <td className="getal">{regel.capaciteit}</td>
                    <td>
                      {regel.fouten.map((foutRegel) => (
                        <div key={foutRegel} className="klein" style={{ color: "var(--fout)" }}>
                          {foutRegel}
                        </div>
                      ))}
                      {regel.waarschuwingen.map((waarschuwing) => (
                        <div key={waarschuwing} className="klein muted">{waarschuwing}</div>
                      ))}
                      {regel.fouten.length === 0 && regel.waarschuwingen.length === 0 && (
                        <Badge toon="goed">in orde</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </Tabel>
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
              <Veld label="Standaard aantal plekken" hint="Gebruikt als het bestand geen capaciteit noemt. Per uitje later aan te passen.">
                <Invoer
                  inputMode="numeric"
                  value={standaardCap}
                  onChange={(e) => setStandaardCap(e.target.value)}
                />
              </Veld>
              <Melding type="info">
                Na het controleren zie je precies welke uitjes herkend zijn en welke regels een fout hebben. Er
                wordt pas opgeslagen als je bevestigt. De hele import is daarna in één keer ongedaan te maken.
              </Melding>
            </>
          )}
        </Modal>
      )}

      {wijzigPeriode && (
        <Modal
          titel="Periode wijzigen"
          sluiten={() => setWijzigPeriode(false)}
          acties={
            <>
              <Knop onClick={() => setWijzigPeriode(false)}>Annuleren</Knop>
              <Knop variant="primair" onClick={() => void wijzigPeriodeOpslaan()} disabled={bezig}>
                Opslaan
              </Knop>
            </>
          }
        >
          <Veld label="Naam">
            <Invoer
              value={periodeVelden.naam}
              onChange={(e) => setPeriodeVelden({ ...periodeVelden, naam: e.target.value })}
            />
          </Veld>
          <div className="grid-2">
            <Veld label="Eerste dag">
              <Invoer
                type="date"
                value={periodeVelden.start_op}
                onChange={(e) => setPeriodeVelden({ ...periodeVelden, start_op: e.target.value })}
              />
            </Veld>
            <Veld label="Laatste dag">
              <Invoer
                type="date"
                value={periodeVelden.eind_op}
                onChange={(e) => setPeriodeVelden({ ...periodeVelden, eind_op: e.target.value })}
              />
            </Veld>
          </div>
          <Veld label="Aanmelddeadline">
            <Invoer
              type="date"
              value={periodeVelden.aanmelddeadline}
              onChange={(e) => setPeriodeVelden({ ...periodeVelden, aanmelddeadline: e.target.value })}
            />
          </Veld>
          <Veld label="Standaard aantal plekken">
            <Invoer
              inputMode="numeric"
              value={periodeVelden.standaard_capaciteit}
              onChange={(e) => setPeriodeVelden({ ...periodeVelden, standaard_capaciteit: e.target.value })}
            />
          </Veld>
        </Modal>
      )}

      {statusBevestig && (
        <Bevestig
          titel={statusBevestig === "gepubliceerd" ? "De opgave openen?" : "De opgave sluiten?"}
          uitleg={
            statusBevestig === "gepubliceerd"
              ? "Medewerkers kunnen daarna telefonisch opgaven invoeren. Deelnemers krijgen geen login; zij bellen zoals altijd."
              : "Na het sluiten kan niemand meer opgeven of afmelden, behalve de coördinator met een reden. Daarna kan de indeling worden berekend."
          }
          bevestigLabel={statusBevestig === "gepubliceerd" ? "Ja, opgave openen" : "Ja, opgave sluiten"}
          bezig={bezig}
          bevestig={() => void zetStatus(statusBevestig)}
          annuleer={() => setStatusBevestig(null)}
        />
      )}
    </div>
  )
}
