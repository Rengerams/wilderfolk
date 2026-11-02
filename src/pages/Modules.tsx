import { useEffect, useState } from "react"
import { api, foutTekst } from "../api"
import { useAuth } from "../auth"
import { GebruikerFuncties } from "../components/GebruikerFuncties"
import {
  Badge,
  Invoer,
  Kaart,
  Knop,
  Laad,
  Melding,
  PaginaKop,
  Schakelaar,
  Veld,
} from "../components/ui"

type Module = { sleutel: string; naam: string; uitleg: string; aan: boolean; optioneel: boolean }

const THEMAS = [
  { waarde: "rood", naam: "Diligence-rood", kleur: "#c22127" },
  { waarde: "blauw", naam: "Blauw", kleur: "#1761a8" },
  { waarde: "groen", naam: "Groen", kleur: "#0e7a56" },
  { waarde: "paars", naam: "Paars", kleur: "#6b3fc4" },
]

export function Modules() {
  const { herlaad, mag } = useAuth()
  const [modules, setModules] = useState<Module[]>([])
  const [instellingen, setInstellingen] = useState<Record<string, string>>({})
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<{ tekst: string; ongedaan?: () => void } | null>(null)
  const [bezig, setBezig] = useState(false)

  async function haal() {
    setLaden(true)
    try {
      const [moduleAntwoord, instellingAntwoord] = await Promise.all([
        api<{ modules: Module[] }>("/modules"),
        api<{ instellingen: Record<string, string> }>("/instellingen"),
      ])
      setModules(moduleAntwoord.modules)
      setInstellingen(instellingAntwoord.instellingen)
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

  async function zetModule(module: Module, aan: boolean) {
    setBezig(true)
    setFout(null)
    try {
      await api(`/modules/${module.sleutel}`, {
        method: "PATCH",
        body: JSON.stringify({ aan }),
      })
      setMelding({
        tekst: `De module "${module.naam}" staat nu ${aan ? "aan" : "uit"}. Bestaande gegevens blijven bewaard.`,
        ongedaan: async () => {
          await api(`/modules/${module.sleutel}`, {
            method: "PATCH",
            body: JSON.stringify({ aan: !aan }),
          })
          setMelding(null)
          await haal()
          await herlaad()
        },
      })
      await haal()
      await herlaad()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function slaInstellingenOp() {
    setBezig(true)
    try {
      await api("/instellingen", {
        method: "PATCH",
        body: JSON.stringify(instellingen),
      })
      setMelding({ tekst: "De instellingen zijn opgeslagen." })
      await herlaad()
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  if (laden) return <Laad />

  const chauffeurskostenAan = modules.find((m) => m.sleutel === "chauffeurskosten")?.aan === true
  const kanWijzigen = mag("modules", "wijzigen")

  return (
    <div>
      <PaginaKop
        titel="Functies"
        stap="Zet een module aan of uit. De uitleg staat eronder."
        uitleg="Elk onderdeel is een functie die je aan of uit kunt zetten: voor de hele organisatie én per gebruiker. De kern staat altijd aan: deelnemers, groepjes, uitjes, opgave, indeling, reservelijst, accounts en het wijzigingsoverzicht."
      />

      {fout && <Melding type="fout">{fout}</Melding>}
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

      <Kaart titel="Kern" uitleg="Deze onderdelen horen bij de basis en kunnen niet uit.">
        <div className="rij">
          {["Deelnemers", "Groepjes", "Periodes en uitjes", "Opgave", "Indeling", "Reservelijst", "Accounts en rollen", "Wijzigingsoverzicht"].map(
            (naam) => (
              <Badge key={naam} toon="goed">
                {naam}
              </Badge>
            ),
          )}
        </div>
      </Kaart>

      <Kaart titel="Functies voor de hele organisatie" uitleg="Elke functie heeft een uitleg in gewone taal. Aanzetten of uitzetten kan op elk moment; ingevoerde gegevens blijven bewaard.">
        <div className="lijst">
          {modules.map((module) => (
            <div key={module.sleutel} className="lijst-item">
              <Schakelaar
                aan={module.aan}
                aanzetten={(aan) => void zetModule(module, aan)}
                label={module.naam}
                uitleg={module.uitleg}
                uitgeschakeld={
                  !kanWijzigen || (module.sleutel === "kas" && !chauffeurskostenAan && !module.aan)
                }
              />
              <div className="rij marge-boven--klein">
                {module.sleutel === "kas" && !chauffeurskostenAan && (
                  <span className="klein muted">Kas kan alleen aan als Chauffeurskosten aan staat.</span>
                )}
                {module.sleutel === "ai_assistent" && module.aan && (
                  <span className="klein muted">
                    De assistent ziet alleen het programma (uitjes, datums, tijden en prijzen) en nooit
                    persoonsgegevens.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Kaart>

      {mag("gebruikers", "zien") && <GebruikerFuncties kanWijzigen={kanWijzigen} />}

      <Kaart titel="Instellingen" uitleg="Deze waarden gebruikt het systeem bij de import, de eerlijke indeling en de kas. Het kleurthema geldt voor iedereen in de organisatie.">
        <div className="grid-2">
          <Veld label="Standaard aantal plekken" hint="Gebruikt bij import als het bestand geen capaciteit noemt.">
            <Invoer
              inputMode="numeric"
              value={instellingen.standaard_capaciteit ?? ""}
              onChange={(e) => setInstellingen({ ...instellingen, standaard_capaciteit: e.target.value })}
            />
          </Veld>
          <Veld label="Terugkijkperiode in maanden" hint="Alleen deelnames in deze periode tellen mee bij 'vaak geweest'.">
            <Invoer
              inputMode="numeric"
              value={instellingen.terugkijk_maanden ?? ""}
              onChange={(e) => setInstellingen({ ...instellingen, terugkijk_maanden: e.target.value })}
            />
          </Veld>
          <Veld label="Waarschuwingsgrens contant geld (€)" hint="Alleen een waarschuwing; er wordt niets geblokkeerd.">
            <Invoer
              inputMode="decimal"
              value={instellingen.kas_grens ?? ""}
              onChange={(e) => setInstellingen({ ...instellingen, kas_grens: e.target.value })}
            />
          </Veld>
          <Veld label="Naam van de organisatie">
            <Invoer
              value={instellingen.organisatie_naam ?? ""}
              onChange={(e) => setInstellingen({ ...instellingen, organisatie_naam: e.target.value })}
            />
          </Veld>
        </div>

        <fieldset className="thema-keuze">
          <legend>Kleurthema</legend>
          {THEMAS.map((thema) => {
            const gekozen = (instellingen.thema ?? "rood") === thema.waarde
            return (
              <label
                key={thema.waarde}
                className={`thema-keuze__optie${gekozen ? " is-gekozen" : ""}`}
              >
                <input
                  type="radio"
                  name="thema"
                  value={thema.waarde}
                  checked={gekozen}
                  disabled={!kanWijzigen}
                  onChange={() => setInstellingen({ ...instellingen, thema: thema.waarde })}
                />
                <span className="thema-keuze__stip" style={{ background: thema.kleur }} aria-hidden="true" />
                <span>{thema.naam}</span>
              </label>
            )
          })}
        </fieldset>

        {kanWijzigen && (
          <Knop variant="primair" onClick={() => void slaInstellingenOp()} disabled={bezig}>
            Instellingen opslaan
          </Knop>
        )}
      </Kaart>
    </div>
  )
}
