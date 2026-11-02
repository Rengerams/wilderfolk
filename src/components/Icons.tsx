import type { ReactNode } from "react"

/**
 * Eenvoudige lijniconen. Ze versieren de navigatie en de kaarten en hebben
 * altijd een tekstlabel ernaast, dus voor schermlezers zijn ze verborgen.
 */
const PADEN: Record<string, ReactNode> = {
  vandaag: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  start: (
    <>
      <path d="M12 3.5l2.1 5.2 5.4 2.1-5.4 2.1L12 18.1l-2.1-5.2L4.5 10.8l5.4-2.1z" />
      <path d="M18.4 3.2l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" />
    </>
  ),
  deelnemers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.2 20c0-3.2 2.6-5.8 5.8-5.8s5.8 2.6 5.8 5.8" />
      <path d="M16 5.4a3 3 0 0 1 0 5.8" />
      <path d="M17.6 14.4c2 .8 3.2 2.8 3.2 5" />
    </>
  ),
  groepjes: (
    <>
      <circle cx="8" cy="9" r="2.7" />
      <circle cx="16" cy="9" r="2.7" />
      <path d="M3 19c0-2.7 2.2-4.9 5-4.9" />
      <path d="M21 19c0-2.7-2.2-4.9-5-4.9" />
      <path d="M8.6 19c0-1.9 1.5-3.4 3.4-3.4s3.4 1.5 3.4 3.4" />
    </>
  ),
  programma: (
    <>
      <rect x="3.2" y="4.6" width="17.6" height="16" rx="3" />
      <path d="M8 3v3.2M16 3v3.2M3.2 9.8h17.6" />
    </>
  ),
  opgave: (
    <>
      <rect x="5" y="4.6" width="14" height="16.4" rx="3" />
      <path d="M9.2 4.6V3.4h5.6v1.2" />
      <path d="M9 13.2l2 2 4-4.2" />
    </>
  ),
  indeling: (
    <>
      <path d="M4 7.5h9M17.5 7.5H20" />
      <path d="M4 16.5h3M11.5 16.5H20" />
      <circle cx="15" cy="7.5" r="2.2" />
      <circle cx="9" cy="16.5" r="2.2" />
    </>
  ),
  bellijst: (
    <path d="M6.4 3.6h3.1l1.5 3.9-2 1.5a12.4 12.4 0 0 0 6 6l1.5-2 3.9 1.5v3.1a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 4.4 5.8a2 2 0 0 1 2-2.2z" />
  ),
  vervoer: (
    <>
      <rect x="3" y="4.2" width="18" height="12.2" rx="3" />
      <path d="M3 10.4h18" />
      <circle cx="7.2" cy="18.4" r="1.8" />
      <circle cx="16.8" cy="18.4" r="1.8" />
    </>
  ),
  declaraties: (
    <>
      <path d="M6 3.4h12v17.2l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8.4h6M9 12.2h6" />
    </>
  ),
  kas: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10.4h18" />
      <circle cx="16.4" cy="14.6" r="1.3" />
    </>
  ),
  gebruikers: (
    <>
      <circle cx="9.2" cy="8" r="3.2" />
      <path d="M3.4 20c0-3.2 2.6-5.8 5.8-5.8 1 0 2 .3 2.8.8" />
      <path d="M15.4 17.6l1.6 1.6 3.4-3.6" />
    </>
  ),
  rollen: (
    <>
      <path d="M12 3.2l7 3v4.9c0 4.3-2.8 8-7 9.4-4.2-1.4-7-5.1-7-9.4V6.2z" />
      <path d="M9.2 11.6l2 2 3.6-3.8" />
    </>
  ),
  functies: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="5" />
      <circle cx="16.2" cy="12" r="2.8" />
    </>
  ),
  logboek: <path d="M3 12h3.8l2.4-6.8 4 13.6L15.6 12H21" />,
  feedback: (
    <>
      <path d="M20.6 4.6H3.4a1.9 1.9 0 0 0-1.9 1.9v8.6a1.9 1.9 0 0 0 1.9 1.9h2.8v3.8l5-3.8h9.4a1.9 1.9 0 0 0 1.9-1.9V6.5a1.9 1.9 0 0 0-1.9-1.9z" />
      <path d="M7.6 9.4h8.8M7.6 12.6h5.6" />
    </>
  ),
  assistent: (
    <>
      <path d="M11.4 3.4l1.9 4.8 4.8 1.9-4.8 1.9-1.9 4.8-1.9-4.8-4.8-1.9 4.8-1.9z" />
      <path d="M18.2 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  hulp: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </>
  ),
  rapportage: (
    <>
      <path d="M4 19.5h16" />
      <rect x="6" y="11" width="3.2" height="6" rx="1" />
      <rect x="11.4" y="7" width="3.2" height="10" rx="1" />
      <rect x="16.8" y="13.5" width="3.2" height="3.5" rx="1" />
    </>
  ),
  klok: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.2v5.2l3.2 1.9" />
    </>
  ),
  vink: <path d="M4.5 12.4l4.8 4.8L19.5 6.6" />,
  waarschuwing: (
    <>
      <path d="M10.6 4.2a1.6 1.6 0 0 1 2.8 0l7.4 13a1.6 1.6 0 0 1-1.4 2.4H4.6a1.6 1.6 0 0 1-1.4-2.4z" />
      <path d="M12 9.4v4.2M12 16.8h.01" />
    </>
  ),
  pijl: <path d="M4.5 12h14.2M13 6.2l5.8 5.8-5.8 5.8" />,
  zoeken: (
    <>
      <circle cx="11" cy="11" r="6.8" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  uitloggen: (
    <>
      <path d="M14.6 4.2h3.2a2 2 0 0 1 2 2v11.6a2 2 0 0 1-2 2h-3.2" />
      <path d="M9.6 8.2L5.8 12l3.8 3.8" />
      <path d="M5.8 12h9.4" />
    </>
  ),
}

export type IcoonNaam = keyof typeof PADEN

export function Icoon({ naam, className }: { naam: IcoonNaam; className?: string }) {
  return (
    <svg
      className={`icoon${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PADEN[naam]}
    </svg>
  )
}
