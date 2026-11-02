import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import { Icoon, type IcoonNaam } from "./Icons"

// ---------------------------------------------------------------- knoppen

type KnopProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primair" | "secundair" | "gevaar" | "rustig"
  breed?: boolean
}

export function Knop({ variant = "secundair", breed, className, ...rest }: KnopProps) {
  return (
    <button
      type="button"
      className={`knop knop--${variant}${breed ? " knop--breed" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  )
}

// ---------------------------------------------------------------- structuur

export function Kaart({
  titel,
  uitleg,
  acties,
  children,
  className,
}: {
  titel?: ReactNode
  uitleg?: ReactNode
  acties?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={`kaart${className ? ` ${className}` : ""}`}>
      {(titel || acties) && (
        <div className="kaart__kop">
          <div>
            {titel && <h2 className="kaart__titel">{titel}</h2>}
            {uitleg && <p className="kaart__uitleg">{uitleg}</p>}
          </div>
          {acties && <div className="kaart__acties">{acties}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function PaginaKop({
  titel,
  uitleg,
  acties,
}: {
  titel: string
  uitleg?: ReactNode
  /** Wat de gebruiker op dit scherm nu het beste kan doen. Wordt niet meer getoond:
   *  de uitleg eronder zegt meestal hetzelfde en de melding kwam op elk scherm terug. */
  stap?: ReactNode
  acties?: ReactNode
}) {
  return (
    <div className="pagina-kop">
      <div>
        <h1>{titel}</h1>
        {uitleg && <p className="pagina-kop__uitleg">{uitleg}</p>}
      </div>
      {acties && <div className="pagina-kop__acties">{acties}</div>}
    </div>
  )
}

export function Badge({
  children,
  toon = "neutraal",
}: {
  children: ReactNode
  toon?: "neutraal" | "goed" | "waarschuwing" | "fout" | "info"
}) {
  return <span className={`badge badge--${toon}`}>{children}</span>
}

export function Stat({
  icoon,
  waarde,
  label,
  toon = "rood",
  hint,
}: {
  icoon: IcoonNaam
  waarde: ReactNode
  label: string
  toon?: "rood" | "blauw" | "groen" | "amber"
  hint?: ReactNode
}) {
  return (
    <div className={`stat stat--${toon}`}>
      <span className="stat__icoon" aria-hidden="true">
        <Icoon naam={icoon} />
      </span>
      <div>
        <div className="stat__waarde">{waarde}</div>
        <div className="stat__label">{label}</div>
        {hint && <div className="stat__hint">{hint}</div>}
      </div>
    </div>
  )
}

export function Melding({
  type = "info",
  titel,
  children,
  actie,
}: {
  type?: "info" | "succes" | "waarschuwing" | "fout"
  titel?: string
  children?: ReactNode
  actie?: { label: string; onClick: () => void }
}) {
  return (
    <div className={`melding melding--${type}`} role={type === "fout" ? "alert" : "status"}>
      <div>
        {titel && <strong className="melding__titel">{titel}</strong>}
        {children && <div className="melding__tekst">{children}</div>}
      </div>
      {actie && (
        <button type="button" className="melding__actie" onClick={actie.onClick}>
          {actie.label}
        </button>
      )}
    </div>
  )
}

export function Leeg({
  titel,
  uitleg,
  actie,
}: {
  titel: string
  uitleg: ReactNode
  actie?: ReactNode
}) {
  return (
    <div className="leeg">
      <p className="leeg__titel">{titel}</p>
      <p className="leeg__uitleg">{uitleg}</p>
      {actie && <div className="leeg__actie">{actie}</div>}
    </div>
  )
}

export function Laad({ tekst = "Bezig met laden…" }: { tekst?: string }) {
  return (
    <p className="laad" role="status">
      {tekst}
    </p>
  )
}

// ---------------------------------------------------------------- formulieren

export function Veld({
  label,
  hint,
  children,
  verplicht,
}: {
  label: string
  hint?: string
  children: ReactNode
  verplicht?: boolean
}) {
  return (
    <label className="veld">
      <span className="veld__label">
        {label}
        {verplicht && <span className="veld__verplicht" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && <span className="veld__hint">{hint}</span>}
    </label>
  )
}

export function Invoer(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="invoer" {...props} />
}

export function Tekstvak(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="invoer invoer--tekstvak" rows={3} {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="invoer invoer--select" {...props} />
}

export function Schakelaar({
  aan,
  aanzetten,
  label,
  uitleg,
  uitgeschakeld,
}: {
  aan: boolean
  aanzetten: (waarde: boolean) => void
  label: string
  uitleg?: string
  uitgeschakeld?: boolean
}) {
  const id = useId()
  return (
    <div className={`schakelaar${uitgeschakeld ? " schakelaar--uit" : ""}`}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={aan}
        className={`schakelaar__knop${aan ? " is-aan" : ""}`}
        onClick={() => aanzetten(!aan)}
        disabled={uitgeschakeld}
      >
        <span className="schakelaar__bal" />
        <span className="schakelaar__tekst">{aan ? "Aan" : "Uit"}</span>
      </button>
      <label htmlFor={id} className="schakelaar__label">
        <strong>{label}</strong>
        {uitleg && <span>{uitleg}</span>}
      </label>
    </div>
  )
}

// ---------------------------------------------------------------- dialoog

export function Modal({
  titel,
  uitleg,
  children,
  sluiten,
  acties,
  breed,
}: {
  titel: string
  uitleg?: ReactNode
  children?: ReactNode
  sluiten: () => void
  acties?: ReactNode
  breed?: boolean
}) {
  useEffect(() => {
    const bijToets = (gebeurtenis: KeyboardEvent) => {
      if (gebeurtenis.key === "Escape") sluiten()
    }
    document.addEventListener("keydown", bijToets)
    return () => document.removeEventListener("keydown", bijToets)
  }, [sluiten])

  return (
    <div className="modal-achtergrond" onMouseDown={(e) => e.target === e.currentTarget && sluiten()}>
      <div
        className={`modal${breed ? " modal--breed" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={titel}
      >
        <div className="modal__kop">
          <h2>{titel}</h2>
          <button type="button" className="modal__sluiten" onClick={sluiten} aria-label="Sluiten">
            Sluiten
          </button>
        </div>
        {uitleg && <p className="modal__uitleg">{uitleg}</p>}
        <div className="modal__inhoud">{children}</div>
        {acties && <div className="modal__acties">{acties}</div>}
      </div>
    </div>
  )
}

export function Bevestig({
  titel,
  uitleg,
  bevestigLabel = "Ja, doorgaan",
  gevaar,
  bezig,
  bevestig,
  annuleer,
  children,
}: {
  titel: string
  uitleg: ReactNode
  bevestigLabel?: string
  gevaar?: boolean
  bezig?: boolean
  bevestig: () => void
  annuleer: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      titel={titel}
      uitleg={uitleg}
      sluiten={annuleer}
      acties={
        <>
          <Knop onClick={annuleer}>Annuleren</Knop>
          <Knop
            variant={gevaar ? "gevaar" : "primair"}
            onClick={bevestig}
            disabled={bezig}
          >
            {bezig ? "Bezig…" : bevestigLabel}
          </Knop>
        </>
      }
    >
      {children}
    </Modal>
  )
}

// ---------------------------------------------------------------- tabellen

export function Tabel({
  kolommen,
  children,
  compact,
}: {
  kolommen: (string | { tekst: string; getal?: boolean })[]
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div className="tabel-wrap">
      <table className={`tabel${compact ? " tabel--compact" : ""}`}>
        <thead>
          <tr>
            {kolommen.map((kolom, index) => (
              <th key={index} scope="col" className={typeof kolom !== "string" && kolom.getal ? "getal" : undefined}>
                {typeof kolom === "string" ? kolom : kolom.tekst}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** Gegroepeerde rij in een tabel: gekleurd balkje met de groepsnaam. */
export function TabelGroep({
  label,
  aantal,
  kolommen,
  toon = "info",
}: {
  label: string
  aantal?: number
  kolommen: number
  toon?: "goed" | "info" | "waarschuwing" | "neutraal"
}) {
  return (
    <tr className={`tabel__groep tabel__groep--${toon}`}>
      <td colSpan={kolommen}>
        <span className="tabel__groep-inhoud">
          {label}
          {typeof aantal === "number" && <span className="tabel__groep-telling">{aantal}</span>}
        </span>
      </td>
    </tr>
  )
}
