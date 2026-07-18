export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`openface-brand-mark ${className}`} aria-hidden="true">
      <img src="/brand/openface-cat-logo.png" alt="" />
    </span>
  );
}
