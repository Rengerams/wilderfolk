import { Invoer, Knop } from "./ui"

const KEUZES = [
  { plekken: 7, label: "1 busje" },
  { plekken: 14, label: "2 busjes" },
  { plekken: 40, label: "Touringcar" },
]

/**
 * Plekken kiezen in de taal van de stichting: één busje, twee busjes of een
 * touringcar. Een ander aantal blijft gewoon intypbaar.
 */
export function PlekkenKeuze({
  waarde,
  onChange,
  hint = "Eén busje is 7 plekken, twee busjes 14 en een touringcar 40. De voertuigen worden hier automatisch op aangepast.",
}: {
  waarde: string
  onChange: (waarde: string) => void
  hint?: string
}) {
  const gekozen = Number(waarde)
  return (
    <div className="veld">
      <span className="veld__label">Aantal plekken</span>
      <div className="rij">
        {KEUZES.map((keuze) => (
          <Knop
            key={keuze.plekken}
            variant={gekozen === keuze.plekken ? "primair" : "secundair"}
            aria-pressed={gekozen === keuze.plekken}
            onClick={() => onChange(String(keuze.plekken))}
          >
            {keuze.label} ({keuze.plekken})
          </Knop>
        ))}
        <span className="rij" style={{ alignItems: "center", gap: "0.4rem" }}>
          <span className="klein">anders, namelijk</span>
          <Invoer
            inputMode="numeric"
            aria-label="Aantal plekken"
            style={{ width: "5rem" }}
            value={waarde}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      </div>
      <span className="veld__hint">{hint}</span>
    </div>
  )
}
