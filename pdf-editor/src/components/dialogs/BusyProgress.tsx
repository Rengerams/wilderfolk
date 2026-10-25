export function BusyProgress({ busy }: { busy: { label: string; progress: number } }) {
  return (
    <div>
      <p className="hint">{busy.label}</p>
      <div className="progress">
        <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
      </div>
    </div>
  )
}
