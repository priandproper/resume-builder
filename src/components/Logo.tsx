/** The app mark: a resume "page" — header bar + text lines — in the accent color. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="4" y="2.5" width="16" height="19" rx="3.2" fill="var(--accent)" />
      <rect x="8" y="6.4" width="8" height="2.1" rx="1.05" fill="#fff" />
      <path
        d="M8 12h8M8 15h8M8 18h5"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  )
}
