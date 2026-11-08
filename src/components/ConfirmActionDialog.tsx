import { useModalFocus } from '../hooks/useModalFocus';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';

interface ConfirmActionDialogProps {
  owner: string;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shared armed confirmation: focus enters on Cancel, Escape closes, focus returns on close. */
export default function ConfirmActionDialog({
  owner, title, message, confirmLabel, onConfirm, onCancel,
}: ConfirmActionDialogProps) {
  const dialogRef = useModalFocus<HTMLDivElement>();
  useOverlayKeyboard(owner, onCancel);

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 p-4 text-stone-100">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md space-y-4 rounded-xl border border-rose-700/70 bg-stone-950 p-5 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-rose-200">{title}</h2>
        <p className="text-sm text-stone-300">{message}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            className="rounded bg-stone-700 px-4 py-2 text-sm font-semibold text-stone-100 hover:bg-stone-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
