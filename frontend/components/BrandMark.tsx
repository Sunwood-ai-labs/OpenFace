export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`openface-brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M15.5 23.5 12 9l13.2 7.1A24 24 0 0 1 32 15a24 24 0 0 1 6.8 1.1L52 9l-3.5 14.5A22 22 0 0 1 53 37c0 11-9.4 18-21 18s-21-7-21-18a22 22 0 0 1 4.5-13.5Z" />
        <path d="M21.5 32.5c2.2-2.3 5.7-2.3 8 0M34.5 32.5c2.3-2.3 5.8-2.3 8 0" />
        <path d="m29 39 3 2.5 3-2.5" />
        <path d="M32 41.5v2.2M32 43.7c-2.2 0-4 1-5.2 2.5M32 43.7c2.2 0 4 1 5.2 2.5" />
      </svg>
    </span>
  );
}
