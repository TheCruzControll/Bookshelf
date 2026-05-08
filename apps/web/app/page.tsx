const feedItems = [
  {
    name: "Maya",
    action: "finished",
    book: "Tomorrow, and Tomorrow, and Tomorrow",
    shelf: "modern favorites"
  },
  {
    name: "Andre",
    action: "ranked",
    book: "The Fifth Season",
    shelf: "#1 on sci-fi"
  },
  {
    name: "Sam",
    action: "dropped",
    book: "a dense biography",
    shelf: "and saved three essays"
  }
];

const shelves = [
  "quiet favorites",
  "sharp little novels",
  "books friends keep pressing into my hands"
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">Hone</p>
        <h1>Hone your taste through trusted readers.</h1>
        <p className="lede">
          A warm social shelf for ranking books, following friends, and finding
          the next thing worth carrying around.
        </p>
        <div className="shelves" aria-label="Sample shelves">
          {shelves.map((shelf) => (
            <span key={shelf}>{shelf}</span>
          ))}
        </div>
      </section>
      <section className="board" aria-label="Sample friend activity">
        <div className="folkPattern" aria-hidden="true">
          <span className="sun" />
          <span className="leaf" />
          <span className="moon" />
          <span className="bar" />
        </div>
        <div className="feed">
          {feedItems.map((item) => (
            <article className="feedItem" key={`${item.name}-${item.book}`}>
              <p>{item.name}</p>
              <strong>{item.action}</strong>
              <span>{item.book}</span>
              <small>{item.shelf}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
