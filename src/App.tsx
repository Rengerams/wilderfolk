import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "./auth"
import { Layout } from "./components/Layout"
import { VersieLabel } from "./components/VersieLabel"
import { Laad } from "./components/ui"
import { Assistent } from "./pages/Assistent"
import { Bellijst } from "./pages/Bellijst"
import { Dashboard } from "./pages/Dashboard"
import { DeelnemerDetail } from "./pages/DeelnemerDetail"
import { Deelnemers } from "./pages/Deelnemers"
import { Declaraties } from "./pages/Declaraties"
import { Feedback } from "./pages/Feedback"
import { Gebruikers } from "./pages/Gebruikers"
import { Groepjes } from "./pages/Groepjes"
import { Hulp } from "./pages/Hulp"
import { Indeling } from "./pages/Indeling"
import { Kas } from "./pages/Kas"
import { Login } from "./pages/Login"
import { Modules } from "./pages/Modules"
import { Opgave } from "./pages/Opgave"
import { PeriodeDetail } from "./pages/Periode"
import { Programma } from "./pages/Programma"
import { Rapportage } from "./pages/Rapportage"
import { Tutorial } from "./pages/Tutorial"
import { Logboek } from "./pages/Logboek"
import { Rollen } from "./pages/Rollen"
import { UitjeDetail } from "./pages/UitjeDetail"

export function App() {
  const { gebruiker, laden } = useAuth()

  if (laden) {
    return (
      <>
        <div className="inhoud">
          <Laad tekst="Systeem wordt geladen…" />
        </div>
        <VersieLabel />
      </>
    )
  }

  if (!gebruiker) {
    return (
      <>
        <Login />
        <VersieLabel />
      </>
    )
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/deelnemers" element={<Deelnemers />} />
          <Route path="/deelnemers/:id" element={<DeelnemerDetail />} />
          <Route path="/groepjes" element={<Groepjes />} />
          <Route path="/programma" element={<Programma />} />
          <Route path="/programma/:id" element={<PeriodeDetail />} />
          <Route path="/uitje/:id" element={<UitjeDetail />} />
          <Route path="/opgave" element={<Opgave />} />
          <Route path="/indeling" element={<Indeling />} />
          <Route path="/indeling/:periodeId" element={<Indeling />} />
          <Route path="/bellijst" element={<Bellijst />} />
          <Route path="/declaraties" element={<Declaraties />} />
          <Route path="/kas" element={<Kas />} />
          <Route path="/rapportage" element={<Rapportage />} />
          <Route path="/gebruikers" element={<Gebruikers />} />
          <Route path="/rollen" element={<Rollen />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/logboek" element={<Logboek />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/assistent" element={<Assistent />} />
          <Route path="/hulp" element={<Hulp />} />
          <Route path="/start" element={<Tutorial />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <VersieLabel />
    </>
  )
}
