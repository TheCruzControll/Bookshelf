# Hone Figma Prototype Build Spec

## Purpose

Create a cross-platform Figma prototype for Hone's v1 reading loop across mobile and web. The prototype should feel like light rice paper, shoji-like structure, quiet Japanese editorial design, and a trusted friend's shelf rather than a generic book tracker.

## Mobile Frames

- `01 Onboarding`: add five books, skip, Goodreads import card.
- `02 Friend Feed`: friends-only activity feed with feed event cards.
- `03 Book Detail`: book cover, friend context, taste match, add-to-shelf CTA.
- `04 Shelf`: ranked shelf view with share/privacy context.
- `05 Ranking Flow`: reorder mode with drag handles and done action.
- `06 Search Add Import`: title/author/ISBN search, scan tab, Goodreads CSV import.
- `07 Profile`: friend profile with taste statement, stats, shelves, public-ready affordance.

Recommended Figma frame: `iPhone 15 Pro`, 393 x 852.

## Web Frames

- `08 Web Landing`: public marketing/discovery entrypoint.
- `09 Web Feed`: logged-in desktop feed with activity column and recommendation/import sidebar.
- `10 Public Profile`: creator-ready public profile page.
- `11 Public Shelf`: shareable ranked shelf page.
- `12 Web Book Detail`: SEO-friendly book detail with social proof and save actions.

Recommended Figma frame: `Desktop`, 1440 x 1024.

## Prototype Links

Mobile:

- Onboarding `Add first books` -> Search/Add.
- Onboarding `Skip` -> Friend Feed.
- Feed event card -> Book Detail.
- Feed shelf update -> Shelf.
- Feed profile item -> Profile.
- Book Detail `Add to shelf` -> Shelf.
- Shelf `Rank` -> Ranking Flow.
- Ranking Flow `Done` -> Shelf.
- Search result -> Book Detail.
- Bottom navigation links: Feed, Shelves, Add, Me.

Web:

- Web Landing `Creators` -> Public Profile.
- Web Landing `Shelves` -> Public Shelf.
- Web Feed activity card -> Web Book Detail.
- Web Feed shelf update -> Public Shelf.
- Public Profile shelf card -> Public Shelf.
- Public Shelf book cover/card -> Web Book Detail.
- Web Book Detail `Save book` -> Search/Add or mobile Add flow.

## Design Tokens

- `Rice Paper`: `#F7F4ED`
- `Panel Paper`: `#FBFAF6`
- `Paper Rule`: `#E5DFD3`
- `Sumi Ink`: `#171411`
- `Soft Ink`: `#676158`
- `Ai Indigo`: `#253F5B`
- `Vermilion Seal`: `#B9472D`

## Typography

- Headings/display: `Noto Serif JP`, 500/600/700.
- Body/UI: `Noto Sans`, 400/500/700/800.
- Native fallback: platform serif for display text and platform sans for body until exact native font bundling is added.

## Component Rules

- Backgrounds should never be pure white or generic beige.
- Prefer thin rules, structured columns, and quiet sections over heavy cards.
- Avoid chunky handmade borders, decorative blobs, and excessive accent colors.
- Use vermilion sparingly for brand seal moments and score emphasis.
- Use ai indigo for metadata, navigation, and secondary hierarchy.
- Feed cards should emphasize the user action first, then book title, then shelf context.
- Mobile should optimize for quick actions and thumb navigation.
- Web should optimize for public pages, richer browsing, sidebars, and shareable SEO-friendly surfaces.

Canonical design direction: `docs/design-system.md`.

## Local Reference

Open the clickable prototype:

`docs/hone-prototype.html`
