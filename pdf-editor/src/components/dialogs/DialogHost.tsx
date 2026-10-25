import type { DialogKind } from "../../types"
import { AboutDialog } from "./AboutDialog"
import { ExitDialog, ClosedDialog } from "./ExitDialogs"
import { ExportDialog } from "./ExportDialog"
import { FindReplaceDialog } from "./FindReplaceDialog"
import { FormFieldsDialog } from "./FormFieldsDialog"
import { LibraryDialog } from "./LibraryDialog"
import { MetadataDialog } from "./MetadataDialog"
import { ExtractPagesDialog } from "./ExtractPagesDialog"
import { NewDocumentDialog } from "./NewDocumentDialog"
import { OcrDialog } from "./OcrDialog"
import { PageNumbersDialog } from "./PageNumbersDialog"
import { ScanDialog } from "./ScanDialog"
import { SettingsDialog } from "./SettingsDialog"
import { SignatureDialog } from "./SignatureDialog"
import { SplitDialog } from "./SplitDialog"
import { StampDialog } from "./StampDialog"
import { WatermarkDialog } from "./WatermarkDialog"

export function DialogHost({ kind }: { kind: Exclude<DialogKind, null> }) {
  switch (kind) {
    case "about":
      return <AboutDialog />
    case "shortcuts":
      return <AboutDialog section="shortcuts" />
    case "new":
      return <NewDocumentDialog />
    case "open":
      return <LibraryDialog />
    case "metadata":
      return <MetadataDialog />
    case "ocr":
      return <OcrDialog />
    case "scan":
      return <ScanDialog />
    case "settings":
      return <SettingsDialog />
    case "export":
      return <ExportDialog />
    case "find":
      return <FindReplaceDialog />
    case "form":
      return <FormFieldsDialog />
    case "pageNumbers":
      return <PageNumbersDialog />
    case "watermark":
      return <WatermarkDialog />
    case "extract":
      return <ExtractPagesDialog />
    case "signature":
      return <SignatureDialog />
    case "stamp":
      return <StampDialog />
    case "split":
      return <SplitDialog />
    case "exit":
      return <ExitDialog />
    case "closed":
      return <ClosedDialog />
    default:
      return null
  }
}
