import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { bootstrapIntroAudio } from './audio/bootstrap'
import './index.css'
import App from './App.tsx'
import GameErrorBoundary from './components/GameErrorBoundary'

bootstrapIntroAudio()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GameErrorBoundary>
        <App />
      </GameErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
