import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api, foutTekst } from "./api"

export type Gebruiker = {
  id: number
  naam: string
  email: string
  rol: string
  rechten: Record<string, Record<string, boolean>>
  twee_staps: boolean
  modules: Record<string, boolean>
  thema: string
}

export type RechtActie = "zien" | "aanmaken" | "wijzigen" | "verwijderen"

type AuthContextWaarde = {
  gebruiker: Gebruiker | null
  laden: boolean
  login: (email: string, wachtwoord: string) => Promise<{ twee_staps?: boolean; code?: string }>
  tweeStaps: (email: string, code: string) => Promise<void>
  uitloggen: () => Promise<void>
  herlaad: () => Promise<void>
  mag: (onderdeel: string, actie: RechtActie) => boolean
  moduleAan: (sleutel: string) => boolean
}

const AuthContext = createContext<AuthContextWaarde | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [gebruiker, setGebruiker] = useState<Gebruiker | null>(null)
  const [laden, setLaden] = useState(true)

  const herlaad = useCallback(async () => {
    try {
      const antwoord = await api<{ gebruiker: Gebruiker }>("/auth/ik")
      setGebruiker(antwoord.gebruiker)
    } catch {
      setGebruiker(null)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    void herlaad()
  }, [herlaad])

  useEffect(() => {
    document.documentElement.dataset.thema = gebruiker?.thema ?? "rood"
  }, [gebruiker?.thema])

  const login = useCallback(async (email: string, wachtwoord: string) => {
    try {
      const antwoord = await api<{
        gebruiker?: Gebruiker
        twee_staps?: boolean
        code?: string
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, wachtwoord }),
      })
      if (antwoord.twee_staps) return { twee_staps: true, code: antwoord.code }
      setGebruiker(antwoord.gebruiker ?? null)
      return {}
    } catch (fout) {
      throw new Error(foutTekst(fout))
    }
  }, [])

  const tweeStaps = useCallback(async (email: string, code: string) => {
    try {
      const antwoord = await api<{ gebruiker: Gebruiker }>("/auth/twee-staps", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      })
      setGebruiker(antwoord.gebruiker)
    } catch (fout) {
      throw new Error(foutTekst(fout))
    }
  }, [])

  const uitloggen = useCallback(async () => {
    await api("/auth/uitloggen", { method: "POST" }).catch(() => undefined)
    setGebruiker(null)
  }, [])

  const mag = useCallback(
    (onderdeel: string, actie: RechtActie) => {
      if (!gebruiker) return false
      if (gebruiker.rol === "Admin") return true
      return gebruiker.rechten?.[onderdeel]?.[actie] === true
    },
    [gebruiker],
  )

  const moduleAan = useCallback(
    (sleutel: string) => gebruiker?.modules?.[sleutel] === true,
    [gebruiker],
  )

  const waarde = useMemo<AuthContextWaarde>(
    () => ({ gebruiker, laden, login, tweeStaps, uitloggen, herlaad, mag, moduleAan }),
    [gebruiker, laden, login, tweeStaps, uitloggen, herlaad, mag, moduleAan],
  )

  return <AuthContext.Provider value={waarde}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextWaarde {
  const waarde = useContext(AuthContext)
  if (!waarde) throw new Error("useAuth buiten AuthProvider gebruikt")
  return waarde
}
