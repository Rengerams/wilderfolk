import { create } from "zustand"

type PasswordRequest = { incorrect: boolean }

type PasswordPromptState = {
  request: PasswordRequest | null
  ask: (incorrect: boolean) => Promise<string | null>
  answer: (password: string | null) => void
}

let pending: ((password: string | null) => void) | null = null

/** Asks for a document password and resolves with it, or null when the user gives up. */
export const usePasswordPrompt = create<PasswordPromptState>((set) => ({
  request: null,
  ask: (incorrect) => {
    pending?.(null)
    return new Promise((resolve) => {
      pending = resolve
      set({ request: { incorrect } })
    })
  },
  answer: (password) => {
    const resolve = pending
    pending = null
    set({ request: null })
    resolve?.(password)
  },
}))
