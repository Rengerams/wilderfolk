import { Component, type ErrorInfo, type ReactNode } from "react"

/**
 * Vangt een onverwachte renderfout op, zodat het scherm niet wit wordt.
 * De medewerker ziet gewone taal en een foutcode; de technische details gaan
 * naar de console van de browser.
 */
export class Foutgrens extends Component<{ children: ReactNode }, { fout: string | null; code: string }> {
  state = { fout: null as string | null, code: "" }

  static getDerivedStateFromError(fout: Error) {
    return { fout: fout.message, code: `F-${Date.now().toString(36).toUpperCase()}` }
  }

  componentDidCatch(fout: Error, info: ErrorInfo) {
    console.error(`[${this.state.code}]`, fout, info.componentStack)
  }

  render() {
    if (!this.state.fout) return this.props.children
    return (
      <div className="inhoud">
        <div className="kaart" style={{ maxWidth: "38rem", margin: "3rem auto" }}>
          <h1>Er ging iets mis</h1>
          <p>
            Dit scherm kon niet worden getoond. Probeer het opnieuw; lukt het daarna nog niet, geef dan
            deze code door aan de beheerder.
          </p>
          <p className="klein muted">Foutcode: {this.state.code}</p>
          <button className="knop" type="button" onClick={() => window.location.reload()}>
            Opnieuw laden
          </button>
        </div>
      </div>
    )
  }
}
