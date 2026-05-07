const feedItems = [
  "Maya finished Tomorrow, and Tomorrow, and Tomorrow",
  "Andre ranked The Fifth Season #1 on Sci-Fi",
  "Sam dropped a dense biography and added three essays to Want to Read"
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Bookshelf</p>
        <h1>See what your friends are actually reading.</h1>
        <p className="lede">
          Rank books on shelves, follow trusted readers, and turn library
          activity into a social discovery feed.
        </p>
      </section>
      <section className="feed" aria-label="Sample friend activity">
        {feedItems.map((item) => (
          <article className="feedItem" key={item}>
            {item}
          </article>
        ))}
      </section>
    </main>
  );
}

