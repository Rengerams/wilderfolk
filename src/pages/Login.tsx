import { useState } from "react"
import { useAuth } from "../auth"
import { api, foutTekst } from "../api"
import { Invoer, Kaart, Knop, Melding, Veld } from "../components/ui"

const DEMO_ACCOUNTS = [
  { email: "admin@diligence.nl", rol: "Admin" },
  { email: "beheerder@diligence.nl", rol: "Beheerder" },
  { email: "coordinator@diligence.nl", rol: "Coördinator" },
  { email: "chauffeur@diligence.nl", rol: "Chauffeur" },
  { email: "penningmeester@diligence.nl", rol: "Penningmeester" },
]

export function Login() {
  const { login, tweeStaps } = useAuth()
  const [stap, setStap] = useState<"inloggen" | "code" | "vergeten" | "herstellen">("inloggen")
  const [email, setEmail] = useState("")
  const [wachtwoord, setWachtwoord] = useState("")
  const [code, setCode] = useState("")
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState("")
  const [fout, setFout] = useState<string | null>(null)
  const [bericht, setBericht] = useState<string | null>(null)
  const [ontwikkelCode, setOntwikkelCode] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function inloggen() {
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await login(email, wachtwoord)
      if (antwoord.twee_staps) {
        setStap("code")
        setOntwikkelCode(antwoord.code ?? null)
        setBericht("Er is een code gestuurd. Vul de code in om verder te gaan.")
      }
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function codeInvullen() {
    setBezig(true)
    setFout(null)
    try {
      await tweeStaps(email, code)
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function vraagCode() {
    setBezig(true)
    setFout(null)
    setBericht(null)
    try {
      const antwoord = await api<{ bericht: string; code?: string }>("/auth/wachtwoord-vergeten", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setBericht(antwoord.bericht)
      setOntwikkelCode(antwoord.code ?? null)
      setStap("herstellen")
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  async function herstel() {
    setBezig(true)
    setFout(null)
    try {
      const antwoord = await api<{ bericht: string }>("/auth/wachtwoord-herstellen", {
        method: "POST",
        body: JSON.stringify({ email, code, nieuw_wachtwoord: nieuwWachtwoord }),
      })
      setBericht(antwoord.bericht)
      setStap("inloggen")
      setWachtwoord("")
      setCode("")
    } catch (e) {
      setFout(foutTekst(e))
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="login-scherm">
      <section className="login-paneel">
        <img className="zijbalk__logo" src="/logo-diligence.jpg" alt="Stichting Diligence Almere" />
        <h1>Beheersysteem Stichting Diligence Almere</h1>
        <p>
          Deelnemers, uitjes en telefonische opgave op één plek. Met een eerlijke indeling die uitlegt
          waarom iemand wel of niet meegaat, en een bellijst die klaarstaat als je belt.
        </p>
        <p className="klein">
          Grote knoppen, gewone taal en geen Engels jargon. Zo werkt het voor iedereen.
        </p>
      </section>

      <section className="login-vorm">
        <div className="login-vorm__binnen">
          <Kaart titel="Inloggen">
            {fout && <Melding type="fout">{fout}</Melding>}
            {bericht && <Melding type="info">{bericht}</Melding>}
            {ontwikkelCode && (
              <Melding type="waarschuwing" titel="Ontwikkelomgeving">
                Er is nog geen e-mailserver. Gebruik deze code: <strong>{ontwikkelCode}</strong>
              </Melding>
            )}

            {stap === "inloggen" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void inloggen()
                }}
              >
                <Veld label="E-mailadres" verplicht>
                  <Invoer
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Veld>
                <Veld label="Wachtwoord" verplicht>
                  <Invoer
                    type="password"
                    autoComplete="current-password"
                    value={wachtwoord}
                    onChange={(e) => setWachtwoord(e.target.value)}
                    required
                  />
                </Veld>
                <Knop variant="primair" breed type="submit" disabled={bezig}>
                  {bezig ? "Bezig…" : "Inloggen"}
                </Knop>
                <p className="klein marge-boven">
                  <button
                    type="button"
                    className="knop knop--rustig"
                    onClick={() => {
                      setStap("vergeten")
                      setFout(null)
                      setBericht(null)
                    }}
                  >
                    Wachtwoord vergeten
                  </button>
                </p>
              </form>
            )}

            {stap === "code" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void codeInvullen()
                }}
              >
                <Veld label="Code uit de e-mail" hint="Vul de zes cijfers in." verplicht>
                  <Invoer
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoFocus
                    required
                  />
                </Veld>
                <Knop variant="primair" breed type="submit" disabled={bezig}>
                  {bezig ? "Bezig…" : "Doorgaan"}
                </Knop>
                <p className="klein marge-boven">
                  <button
                    type="button"
                    className="knop knop--rustig"
                    onClick={() => {
                      setStap("inloggen")
                      setCode("")
                      setOntwikkelCode(null)
                    }}
                  >
                    Terug
                  </button>
                </p>
              </form>
            )}

            {stap === "vergeten" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void vraagCode()
                }}
              >
                <Veld label="E-mailadres" hint="We sturen een herstelcode als dit adres bekend is." verplicht>
                  <Invoer
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </Veld>
                <Knop variant="primair" breed type="submit" disabled={bezig}>
                  {bezig ? "Bezig…" : "Herstelcode aanvragen"}
                </Knop>
                <p className="klein marge-boven">
                  <button type="button" className="knop knop--rustig" onClick={() => setStap("inloggen")}>
                    Terug naar inloggen
                  </button>
                </p>
              </form>
            )}

            {stap === "herstellen" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void herstel()
                }}
              >
                <Veld label="Herstelcode" verplicht>
                  <Invoer value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
                </Veld>
                <Veld label="Nieuw wachtwoord" hint="Minstens 10 tekens. Een lange zin werkt het beste." verplicht>
                  <Invoer
                    type="password"
                    value={nieuwWachtwoord}
                    onChange={(e) => setNieuwWachtwoord(e.target.value)}
                    required
                  />
                </Veld>
                <Knop variant="primair" breed type="submit" disabled={bezig}>
                  {bezig ? "Bezig…" : "Wachtwoord opslaan"}
                </Knop>
              </form>
            )}
          </Kaart>

          <details className="demo-accounts">
            <summary>Demo-accounts voor deze omgeving</summary>
            <p>Kies een rol om het e-mailadres in te vullen. Het wachtwoord is bij alle accounts hetzelfde.</p>
            <ul>
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email)
                      setWachtwoord("welkom123")
                      setStap("inloggen")
                    }}
                  >
                    {account.rol}
                  </button>{" "}
                  – {account.email}
                </li>
              ))}
            </ul>
            <p className="klein">Wachtwoord: welkom123. Wijzig dit voordat het systeem echt in gebruik gaat.</p>
          </details>
        </div>
      </section>
    </div>
  )
}
