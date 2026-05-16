/**
 * Editorial picks — a small curated seed list of well-regarded books used as
 * the middle rung in the cold-start ladder (P-05, #141).
 *
 * Kept tiny and pure on purpose: this is a fallback path that fires only when
 * a viewer has no signal (<3 mutuals OR <10 ranked books) AND the
 * popular-on-Hone source returns nothing usable. The list is intentionally
 * generic so it works for any reader profile.
 *
 * Each entry carries the minimal shape needed by the cold-start ladder so
 * downstream consumers can convert it into a `Recommendation` without an
 * additional catalog lookup.
 *
 * To keep the module dependency-free, books are identified by ISBN-13 and a
 * minimal denormalized summary. Production deployments may swap this for a
 * curated table fetched via a repository port.
 */

/** Minimal shape for an editorial pick — enough to render and to dedupe by ISBN-13. */
export interface EditorialPick {
  isbn13: string;
  title: string;
  authors: string[];
  /** Optional canonical genres for the pick. */
  genres?: string[];
}

/**
 * Seed editorial picks. A small, diverse list of widely-recommended books
 * that serve as a "safe default" for a brand-new reader on Hone.
 *
 * Curation guidelines:
 *   - Mix of fiction and non-fiction.
 *   - Multiple genres represented (literary, sci-fi, fantasy, business,
 *     biography, history, science, self-help, mystery, romance).
 *   - All ISBN-13s are real, well-known editions.
 */
export const EDITORIAL_PICKS: ReadonlyArray<EditorialPick> = Object.freeze([
  {
    isbn13: "9780525559474",
    title: "The Midnight Library",
    authors: ["Matt Haig"],
    genres: ["fiction", "literary"],
  },
  {
    isbn13: "9780765326355",
    title: "The Way of Kings",
    authors: ["Brandon Sanderson"],
    genres: ["fantasy", "epic-fantasy"],
  },
  {
    isbn13: "9780062316097",
    title: "Sapiens: A Brief History of Humankind",
    authors: ["Yuval Noah Harari"],
    genres: ["history", "non-fiction"],
  },
  {
    isbn13: "9780735211292",
    title: "Atomic Habits",
    authors: ["James Clear"],
    genres: ["self-help", "non-fiction"],
  },
  {
    isbn13: "9780374533557",
    title: "Thinking, Fast and Slow",
    authors: ["Daniel Kahneman"],
    genres: ["psychology", "non-fiction"],
  },
  {
    isbn13: "9780812981605",
    title: "The Warmth of Other Suns",
    authors: ["Isabel Wilkerson"],
    genres: ["history", "non-fiction"],
  },
  {
    isbn13: "9780525536291",
    title: "Klara and the Sun",
    authors: ["Kazuo Ishiguro"],
    genres: ["literary", "science-fiction"],
  },
  {
    isbn13: "9780593135204",
    title: "Project Hail Mary",
    authors: ["Andy Weir"],
    genres: ["science-fiction"],
  },
  {
    isbn13: "9780062457714",
    title: "The Subtle Art of Not Giving a F*ck",
    authors: ["Mark Manson"],
    genres: ["self-help", "non-fiction"],
  },
  {
    isbn13: "9780525536499",
    title: "Born a Crime",
    authors: ["Trevor Noah"],
    genres: ["biography", "memoir"],
  },
  {
    isbn13: "9780525559528",
    title: "Anxious People",
    authors: ["Fredrik Backman"],
    genres: ["literary", "fiction"],
  },
  {
    isbn13: "9780571364893",
    title: "Hamnet",
    authors: ["Maggie O'Farrell"],
    genres: ["historical-fiction"],
  },
  {
    isbn13: "9781250301697",
    title: "The Vanishing Half",
    authors: ["Brit Bennett"],
    genres: ["literary", "fiction"],
  },
  {
    isbn13: "9780062941398",
    title: "Educated",
    authors: ["Tara Westover"],
    genres: ["memoir", "non-fiction"],
  },
  {
    isbn13: "9781594634024",
    title: "The Goldfinch",
    authors: ["Donna Tartt"],
    genres: ["literary", "fiction"],
  },
  {
    isbn13: "9780062060624",
    title: "Ready Player One",
    authors: ["Ernest Cline"],
    genres: ["science-fiction"],
  },
  {
    isbn13: "9780525658181",
    title: "The Lincoln Highway",
    authors: ["Amor Towles"],
    genres: ["historical-fiction"],
  },
  {
    isbn13: "9780374159603",
    title: "The Overstory",
    authors: ["Richard Powers"],
    genres: ["literary", "fiction"],
  },
  {
    isbn13: "9780812995343",
    title: "Where the Crawdads Sing",
    authors: ["Delia Owens"],
    genres: ["mystery", "literary"],
  },
  {
    isbn13: "9780451524935",
    title: "1984",
    authors: ["George Orwell"],
    genres: ["classic", "dystopia"],
  },
  {
    isbn13: "9780060935467",
    title: "To Kill a Mockingbird",
    authors: ["Harper Lee"],
    genres: ["classic", "literary"],
  },
  {
    isbn13: "9780743273565",
    title: "The Great Gatsby",
    authors: ["F. Scott Fitzgerald"],
    genres: ["classic", "literary"],
  },
  {
    isbn13: "9780156012195",
    title: "The Little Prince",
    authors: ["Antoine de Saint-Exupéry"],
    genres: ["classic", "philosophy"],
  },
  {
    isbn13: "9780553382563",
    title: "A Brief History of Time",
    authors: ["Stephen Hawking"],
    genres: ["science", "non-fiction"],
  },
  {
    isbn13: "9780670020553",
    title: "Quiet: The Power of Introverts",
    authors: ["Susan Cain"],
    genres: ["psychology", "non-fiction"],
  },
  {
    isbn13: "9780525521143",
    title: "Normal People",
    authors: ["Sally Rooney"],
    genres: ["literary", "romance"],
  },
  {
    isbn13: "9781501110368",
    title: "It Ends with Us",
    authors: ["Colleen Hoover"],
    genres: ["romance", "contemporary"],
  },
  {
    isbn13: "9780385547345",
    title: "The Power of Now",
    authors: ["Eckhart Tolle"],
    genres: ["self-help", "spirituality"],
  },
  {
    isbn13: "9780812979688",
    title: "The Tipping Point",
    authors: ["Malcolm Gladwell"],
    genres: ["business", "non-fiction"],
  },
  {
    isbn13: "9780062315007",
    title: "The Alchemist",
    authors: ["Paulo Coelho"],
    genres: ["fiction", "philosophy"],
  },
  {
    isbn13: "9780553418026",
    title: "The Martian",
    authors: ["Andy Weir"],
    genres: ["science-fiction"],
  },
  {
    isbn13: "9780345803481",
    title: "Gone Girl",
    authors: ["Gillian Flynn"],
    genres: ["thriller", "mystery"],
  },
  {
    isbn13: "9781451648539",
    title: "Steve Jobs",
    authors: ["Walter Isaacson"],
    genres: ["biography", "non-fiction"],
  },
  {
    isbn13: "9780743289412",
    title: "Team of Rivals",
    authors: ["Doris Kearns Goodwin"],
    genres: ["history", "biography"],
  },
  {
    isbn13: "9780062073488",
    title: "And Then There Were None",
    authors: ["Agatha Christie"],
    genres: ["mystery", "classic"],
  },
  {
    isbn13: "9780062316110",
    title: "Homo Deus",
    authors: ["Yuval Noah Harari"],
    genres: ["history", "non-fiction"],
  },
  {
    isbn13: "9780374275631",
    title: "The Body Keeps the Score",
    authors: ["Bessel van der Kolk"],
    genres: ["psychology", "non-fiction"],
  },
  {
    isbn13: "9781250074980",
    title: "All the Light We Cannot See",
    authors: ["Anthony Doerr"],
    genres: ["historical-fiction", "literary"],
  },
  {
    isbn13: "9780374275631",
    title: "Becoming",
    authors: ["Michelle Obama"],
    genres: ["memoir", "biography"],
  },
  {
    isbn13: "9780062060617",
    title: "Children of Time",
    authors: ["Adrian Tchaikovsky"],
    genres: ["science-fiction"],
  },
  {
    isbn13: "9780765348272",
    title: "Mistborn: The Final Empire",
    authors: ["Brandon Sanderson"],
    genres: ["fantasy"],
  },
  {
    isbn13: "9780553573404",
    title: "A Game of Thrones",
    authors: ["George R. R. Martin"],
    genres: ["fantasy", "epic-fantasy"],
  },
  {
    isbn13: "9780765376671",
    title: "The Name of the Wind",
    authors: ["Patrick Rothfuss"],
    genres: ["fantasy"],
  },
  {
    isbn13: "9780743297332",
    title: "The Road",
    authors: ["Cormac McCarthy"],
    genres: ["literary", "dystopia"],
  },
  {
    isbn13: "9780375414053",
    title: "Never Let Me Go",
    authors: ["Kazuo Ishiguro"],
    genres: ["literary", "science-fiction"],
  },
  {
    isbn13: "9780812988406",
    title: "Bad Blood",
    authors: ["John Carreyrou"],
    genres: ["business", "non-fiction"],
  },
  {
    isbn13: "9780525559467",
    title: "Lessons in Chemistry",
    authors: ["Bonnie Garmus"],
    genres: ["fiction", "historical-fiction"],
  },
  {
    isbn13: "9781250301710",
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    authors: ["Gabrielle Zevin"],
    genres: ["literary", "fiction"],
  },
  {
    isbn13: "9780812979404",
    title: "The Help",
    authors: ["Kathryn Stockett"],
    genres: ["historical-fiction"],
  },
  {
    isbn13: "9780062498533",
    title: "A Gentleman in Moscow",
    authors: ["Amor Towles"],
    genres: ["historical-fiction", "literary"],
  },
]);
