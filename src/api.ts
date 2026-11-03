export class ApiFout extends Error {
  status: number
  data: Record<string, unknown>

  constructor(bericht: string, status: number, data: Record<string, unknown>) {
    super(bericht)
    this.status = status
    this.data = data
  }
}

async function verwerk<T>(antwoord: Response): Promise<T> {
  const tekst = await antwoord.text()
  let data: Record<string, unknown> = {}
  try {
    data = tekst ? (JSON.parse(tekst) as Record<string, unknown>) : {}
  } catch {
    data = {}
  }
  if (!antwoord.ok) {
    // Een 5xx komt vaak van een proxy of een gestopte server: geen technische
    // details tonen, wel tekst waar de medewerker iets aan heeft.
    const standaard =
      antwoord.status >= 500
        ? "De server is tijdelijk niet bereikbaar. Probeer het over een minuut opnieuw."
        : "Er ging iets mis. Probeer het nog eens."
    throw new ApiFout(String(data.fout ?? data.bericht ?? standaard), antwoord.status, data)
  }
  return data as T
}

export async function api<T>(pad: string, opties: RequestInit = {}): Promise<T> {
  let antwoord: Response
  try {
    antwoord = await fetch(`/api${pad}`, {
      credentials: "same-origin",
      headers: opties.body ? { "Content-Type": "application/json" } : undefined,
      ...opties,
    })
  } catch {
    throw new ApiFout("De server is tijdelijk niet bereikbaar. Probeer het over een minuut opnieuw.", 0, {})
  }
  return verwerk<T>(antwoord)
}

export async function download(pad: string, bestandsnaam: string): Promise<void> {
  const antwoord = await fetch(`/api${pad}`, { credentials: "same-origin" })
  if (!antwoord.ok) {
    const data = (await antwoord.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiFout(String(data.fout ?? "Downloaden lukte niet."), antwoord.status, data)
  }
  const blob = await antwoord.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = bestandsnaam
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function bestandAlsBase64(bestand: File): Promise<string> {
  const buffer = await bestand.arrayBuffer()
  let binair = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binair += String.fromCharCode(bytes[i])
  return btoa(binair)
}

export function foutTekst(fout: unknown): string {
  if (fout instanceof ApiFout) return fout.message
  if (fout instanceof Error) return fout.message
  return "Er ging iets mis. Probeer het nog eens."
}

export function duplicatenUitFout(fout: unknown): { id: number; voornaam: string; achternaam: string; telefoon?: string }[] {
  if (fout instanceof ApiFout && Array.isArray(fout.data.duplicaten)) {
    return fout.data.duplicaten as { id: number; voornaam: string; achternaam: string; telefoon?: string }[]
  }
  return []
}

export function initiaal(naam: string): string {
  return naam
    .split(/\s+/)
    .filter(Boolean)
    .map((deel) => deel[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
