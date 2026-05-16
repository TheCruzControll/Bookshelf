import type { Metadata } from "next";
import type { AffiliateLocale, RecommendationInput } from "@hone/domain";
import { Nav } from "../../components/Nav";
import { RecCarousel } from "../../components/RecCarousel";
import { BookBuySection } from "./BookBuySection";
import { fetchBookDetailRecommendations } from "./fetchBookDetailRecommendations";
import { buildBookMeta } from "../../u/og-meta";

interface BookDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}

function isAffiliateLocale(value: string | undefined): value is AffiliateLocale {
  return ["US", "UK", "CA", "AU", "DE", "FR"].includes(value ?? "");
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const book = await fetchBook(id);
  return buildBookMeta(book);
}

async function fetchBook(_id: string): Promise<{ canonicalTitle: string; description?: string; coverUrl?: string } | null> {
  return null;
}

export default async function BookDetailPage({ params, searchParams }: BookDetailPageProps) {
  const { id } = await params;
  const { locale: localeParam } = await searchParams;
  const locale: AffiliateLocale = isAffiliateLocale(localeParam) ? localeParam : "US";

  const book = {
    isbn13: id.match(/^\d{13}$/) ? id : undefined,
    title: "A great book",
    author: "An author"
  };

  const recommendations: RecommendationInput[] = await fetchBookDetailRecommendations(id);

  return (
    <main className="shell bookDetailShell">
      <Nav currentPath="/books" />
      <section className="hero">
        <p className="eyebrow">Book Detail</p>
        <h1>Buy this book</h1>
        <p className="lede">
          Find it at a retailer that supports readers and authors.
        </p>
      </section>
      <section className="board" aria-label="Where to buy">
        <div className="boardHeader">
          <p>Available at</p>
          <span>{locale}</span>
        </div>
        <div className="feed">
          <BookBuySection book={book} bookId={id} locale={locale} />
        </div>
      </section>
      <RecCarousel recommendations={recommendations} />
    </main>
  );
}
