type Props = {
  className?: string
}

export default function Pen({ className }: Props) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" x2="4" y1="3" y2="7" />
      <line x1="2" x2="6" y1="5" y2="5" />
      <path d="M11 20h11" />
      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19H4v-3L16.5 3.5z" />
    </svg>
  )
}
