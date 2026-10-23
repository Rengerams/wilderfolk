import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles/app.css"

const container = document.getElementById("root")
if (!container) {
  throw new Error("The application root element is missing from the page.")
}

createRoot(container).render(<App />)
