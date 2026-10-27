export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-e" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff6b1a" />
          <stop offset="1" stopColor="#ffa36b" />
        </linearGradient>
        <linearGradient id="lg-v" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#54a0ff" />
          <stop offset="1" stopColor="#1b6fe0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#14171b" stroke="#2c3138" />
      {/* stencil "S" cut into a slab, with bridges */}
      <path d="M21.5 9.5H12.2a3 3 0 0 0 0 6h2.1" fill="none" stroke="url(#lg-e)" strokeWidth="3.4" strokeLinecap="butt" />
      <path d="M17.7 16.5h2.1a3 3 0 0 1 0 6H10.5" fill="none" stroke="url(#lg-v)" strokeWidth="3.4" strokeLinecap="butt" />
    </svg>
  );
}
