import type { Request } from "express"
import { q } from "./db"

export type AuditInvoer = {
  actie: string
  entiteit: string
  entiteitId?: string | number | null
  oudeWaarde?: unknown
  nieuweWaarde?: unknown
  omschrijving: string
}

/** Schrijft één regel in het wijzigingsoverzicht. Regels zijn alleen invoegbaar. */
export async function logWijziging(req: Request | undefined, invoer: AuditInvoer): Promise<void> {
  const gebruiker = req?.gebruiker
  await q(
    `insert into audit_log
       (gebruiker_id, gebruiker_naam, actie, entiteit, entiteit_id, oude_waarde, nieuwe_waarde, omschrijving)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      gebruiker?.id ?? null,
      gebruiker?.naam ?? "Systeem",
      invoer.actie,
      invoer.entiteit,
      invoer.entiteitId === undefined || invoer.entiteitId === null ? null : String(invoer.entiteitId),
      invoer.oudeWaarde === undefined ? null : JSON.stringify(invoer.oudeWaarde),
      invoer.nieuweWaarde === undefined ? null : JSON.stringify(invoer.nieuweWaarde),
      invoer.omschrijving,
    ],
  )
}

export function datumNl(waarde: string | Date | null | undefined): string {
  if (!waarde) return ""
  const datum = typeof waarde === "string" ? new Date(`${waarde.slice(0, 10)}T12:00:00`) : waarde
  return datum.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
}

export function tijdNl(waarde: string | null | undefined): string {
  if (!waarde) return ""
  return waarde.slice(0, 5)
}
