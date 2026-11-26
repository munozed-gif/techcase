// Small line icon next to text (used instead of emojis, which render differently on every device).
export function Ico({ i: Icon, size = 12, className = "" }) {
  return <Icon size={size} className={`inline-block flex-shrink-0 align-[-2px] mr-1 ${className}`} aria-hidden="true" />;
}
