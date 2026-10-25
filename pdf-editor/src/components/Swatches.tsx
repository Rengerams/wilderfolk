import { useT } from "../i18n"

export function Swatches({
  colors,
  current,
  onPick,
}: {
  colors: string[]
  current: string
  onPick: (color: string) => void
}) {
  const t = useT()
  return (
    <div className="swatches">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="swatch"
          style={{ background: color }}
          aria-label={t("Use {color}", { color })}
          aria-pressed={current.toLowerCase() === color.toLowerCase()}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  )
}
