/**
 * Title block for every inner page, in the home page's language: a metal badge,
 * a tight Inter headline that may carry one serif-italic accent, a muted lede.
 */
export function PageHero({
  badge,
  title,
  lede,
}: {
  badge: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
}) {
  return (
    <header className="mb-10">
      <span className="badge appear appear--pop [--d:0.1s]">
        <svg className="badge-star" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
          <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
        </svg>
        {badge}
      </span>
      <h1 className="page-title mt-5 appear appear--soft [--d:0.2s]">{title}</h1>
      {lede && <div className="page-lede appear appear--soft [--d:0.32s]">{lede}</div>}
    </header>
  );
}
