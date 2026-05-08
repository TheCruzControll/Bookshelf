const feedItems = [
  {
    name: "Maya",
    action: "finished",
    book: "Tomorrow, and Tomorrow, and Tomorrow",
    score: "?"
  },
  {
    name: "Andre",
    action: "updated",
    book: "The Fifth Season",
    score: "9.12"
  },
  {
    name: "Sam",
    action: "dropped",
    book: "a dense biography",
    score: ""
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="brandMark" aria-label="Hone">
          本 <span>Hone</span>
        </p>
        <p className="eyebrow">Hone</p>
        <h1>Hone your taste through trusted readers.</h1>
        <p className="lede">
          A quiet reading profile built from finished books, close comparisons,
          and the people whose judgment you trust.
        </p>
      </section>
      <section className="board" aria-label="Sample friend activity">
        <div className="boardHeader">
          <p>Friend activity</p>
          <span>Today</span>
        </div>
        <div className="feed">
          {feedItems.map((item) => (
            <article className="feedItem" key={`${item.name}-${item.book}`}>
              <div>
                <p>{item.name}</p>
                <strong>{item.action}</strong>
                <span>{item.book}</span>
              </div>
              {item.score ? <small>{item.score}</small> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
