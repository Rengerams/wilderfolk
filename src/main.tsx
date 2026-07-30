import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { bootstrapIntroAudio } from './audio/bootstrap'
import './index.css'
import App from './App.tsx'

bootstrapIntroAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
