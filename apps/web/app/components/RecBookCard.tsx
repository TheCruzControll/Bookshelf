import type { RecommendationInput } from "@hone/domain";

export interface RecBookCardProps {
  /** The recommendation to render. */
  recommendation: RecommendationInput;
  /** Optional href; defaults to `/books/{book.id}`. */
  href?: string;
}

/**
 * One book card rendered inside a Discover grid or Book Detail carousel
 * (P-06, #142). Shows the cover (or a typographic fallback), the title,
 * and a "why this?" reason chip from the server.
 *
 * The reason string is server-supplied. For the cold-start path (#141)
 * the server returns labels like "Popular on Hone" or "An editor's pick";
 * for the main pipeline (#139) labels look like "Popular among your
 * friends" or "Matches your reading taste".
 */
export function RecBookCard({ recommendation, href }: RecBookCardProps) {
  const { book, reason } = recommendation;
  const target = href ?? `/books/${book.id}`;
  return (
    <a
      href={target}
      className="recBookCard"
      aria-label={`${book.canonicalTitle} — ${reason}`}
    >
      <span className="recBookCardCover" aria-hidden="true">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" />
        ) : (
          <span className="recBookCardCoverFallback">
            {book.canonicalTitle.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="recBookCardBody">
        <strong className="recBookCardTitle">{book.canonicalTitle}</strong>
        <span className="recBookCardReason">{reason}</span>
      </span>
    </a>
  );
}
