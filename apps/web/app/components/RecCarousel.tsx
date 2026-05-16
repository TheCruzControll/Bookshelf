import type { RecommendationInput } from "@hone/domain";
import { RecBookCard } from "./RecBookCard";

export interface RecCarouselProps {
  /** Recommendations to render in the horizontal scroller. */
  recommendations: ReadonlyArray<RecommendationInput>;
  /** Heading shown above the rail. Defaults to "You might also like". */
  heading?: string;
  /** Optional empty-state copy; rendered when `recommendations` is empty. */
  emptyMessage?: string;
}

/**
 * Horizontal "you might also like" rail (P-06, #142).
 *
 * Used on the Book Detail surface to render 6-10 server-supplied
 * recommendations as a horizontal scroller. Each card shows a reason
 * chip; the data is fetched server-side from
 * `recommendations.forBookDetail` and passed in as a prop.
 */
export function RecCarousel({
  recommendations,
  heading = "You might also like",
  emptyMessage = "No recommendations yet — finish a few books to seed your taste profile.",
}: RecCarouselProps) {
  return (
    <section className="recCarousel" aria-label={heading}>
      <header className="recCarouselHeader">
        <h2 className="recCarouselHeading">{heading}</h2>
      </header>
      {recommendations.length === 0 ? (
        <p className="recCarouselEmpty">{emptyMessage}</p>
      ) : (
        <ul className="recCarouselList" role="list">
          {recommendations.map((rec) => (
            <li key={rec.book.id} className="recCarouselItem">
              <RecBookCard recommendation={rec} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
