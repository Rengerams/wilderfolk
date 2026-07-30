interface Props {
  children: string;
  className?: string;
  title?: string;
}

/** Renders emoji with an OS emoji font so Windows does not show "?" placeholders. */
export default function Emoji({ children, className = '', title }: Props) {
  return (
    <span
      className={`font-emoji inline-block leading-none ${className}`.trim()}
      role="img"
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {children}
    </span>
  );
}