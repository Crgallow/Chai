export function ChaiMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill="#F4EFE6" />
      <path
        d="M18 40c6-14 14-22 26-26-2 8-1 16 3 22-8 2-16 1-22 0-3 4-5 8-7 12 0-3 0-5 0-8z"
        fill="#5F7A4A"
      />
      <path
        d="M28 34c4-8 9-13 16-16-1 6 0 11 2 15-6 1-11 1-15 0-1 2-2 4-3 6 0-2 0-3 0-5z"
        fill="#7E9A62"
      />
      <path
        d="M36 18c4-1 8 1 10 5-3 1-6 1-9 0-1-2-1-3-1-5z"
        fill="#C77351"
      />
      <path
        d="M44.5 14.5l1.1 2.4 2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6-1.9-1.8 2.6-.3 1.1-2.4z"
        fill="#E08A5A"
      />
    </svg>
  )
}

export function ChaiWordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`chai-wordmark ${light ? 'is-light' : ''}`}>
      <ChaiMark size={22} />
      Chai
    </span>
  )
}
