import type { EntityId, FeedGroupInput, ProfileInput } from "@hone/domain";
import { FeedGroupedView } from "./components/FeedGroupedView";

/**
 * Sample data used to demonstrate the grouped feed layout on the
 * marketing landing page.  When the home page is moved behind auth
 * and wired to the real `feed.list` tRPC procedure this array will
 * be replaced with the response from the server.
 */
const NOW = new Date("2026-05-16T08:00:00Z");

const DEFAULT_VIS: ProfileInput["defaultVisibility"] = {
  identity: "followers",
  follower_list: "followers",
  review: "followers",
  score: "followers",
  finished_shelf: "followers",
  custom_shelf: "followers",
  want_to_read_shelf: "followers",
  reading_shelf: "followers",
  dropped_shelf: "followers",
  reading_status: "followers",
  activity_stream: "followers",
};

const MAYA = {
  id: "00000000-0000-0000-0000-00000000a001" as EntityId,
  handle: "maya",
  displayName: "Maya",
  verified: false,
  defaultVisibility: DEFAULT_VIS,
  createdAt: NOW,
  updatedAt: NOW,
} as const;

const ANDRE = {
  id: "00000000-0000-0000-0000-00000000a002" as EntityId,
  handle: "andre",
  displayName: "Andre",
  verified: false,
  defaultVisibility: DEFAULT_VIS,
  createdAt: NOW,
  updatedAt: NOW,
} as const;

const SAM = {
  id: "00000000-0000-0000-0000-00000000a003" as EntityId,
  handle: "sam",
  displayName: "Sam",
  verified: false,
  defaultVisibility: DEFAULT_VIS,
  createdAt: NOW,
  updatedAt: NOW,
} as const;

const sampleGroups: FeedGroupInput[] = [
  {
    groupKey: `${MAYA.id}:book_finished:1`,
    occurredAt: NOW,
    items: [
      {
        event: {
          id: "00000000-0000-0000-0000-0000000fe001" as EntityId,
          actorId: MAYA.id,
          verb: "book_finished",
          bookId: "00000000-0000-0000-0000-0000000bb001" as EntityId,
          visibility: "followers",
          occurredAt: NOW,
        },
        actor: { ...MAYA },
        book: {
          id: "00000000-0000-0000-0000-0000000bb001" as EntityId,
          canonicalTitle: "Tomorrow, and Tomorrow, and Tomorrow",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      {
        event: {
          id: "00000000-0000-0000-0000-0000000fe002" as EntityId,
          actorId: MAYA.id,
          verb: "book_finished",
          bookId: "00000000-0000-0000-0000-0000000bb002" as EntityId,
          visibility: "followers",
          occurredAt: NOW,
        },
        actor: { ...MAYA },
        book: {
          id: "00000000-0000-0000-0000-0000000bb002" as EntityId,
          canonicalTitle: "The Fifth Season",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      {
        event: {
          id: "00000000-0000-0000-0000-0000000fe003" as EntityId,
          actorId: MAYA.id,
          verb: "book_finished",
          bookId: "00000000-0000-0000-0000-0000000bb003" as EntityId,
          visibility: "followers",
          occurredAt: NOW,
        },
        actor: { ...MAYA },
        book: {
          id: "00000000-0000-0000-0000-0000000bb003" as EntityId,
          canonicalTitle: "A Memory Called Empire",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    ],
  },
  {
    groupKey: `${ANDRE.id}:book_reviewed:1`,
    occurredAt: NOW,
    items: [
      {
        event: {
          id: "00000000-0000-0000-0000-0000000fe010" as EntityId,
          actorId: ANDRE.id,
          verb: "book_reviewed",
          bookId: "00000000-0000-0000-0000-0000000bb010" as EntityId,
          visibility: "followers",
          occurredAt: NOW,
          scoreAtPublish: 9.12,
        },
        actor: { ...ANDRE },
        book: {
          id: "00000000-0000-0000-0000-0000000bb010" as EntityId,
          canonicalTitle: "The Fifth Season",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    ],
  },
  {
    groupKey: `${SAM.id}:book_dropped:1`,
    occurredAt: NOW,
    items: [
      {
        event: {
          id: "00000000-0000-0000-0000-0000000fe020" as EntityId,
          actorId: SAM.id,
          verb: "book_dropped",
          bookId: "00000000-0000-0000-0000-0000000bb020" as EntityId,
          visibility: "followers",
          occurredAt: NOW,
        },
        actor: { ...SAM },
        book: {
          id: "00000000-0000-0000-0000-0000000bb020" as EntityId,
          canonicalTitle: "a dense biography",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    ],
  },
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
        <FeedGroupedView groups={sampleGroups} />
      </section>
    </main>
  );
}
