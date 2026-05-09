# Hone Monetization Strategy

Working doc for revenue levers. Goal at minimum: cover infra costs. Ideally:
sustain the team. Not v1-launch-blocking — but the levers should be chosen
deliberately, because some are one-way doors that compromise the trust the
product is built on.

This is a strategy doc, not an engineering backlog. Decisions here feed PRD
and roadmap work later.

## Principles

Reader trust is the moat. Anything that erodes it is a long-term loss even if
it's a short-term gain.

1. **Sponsored content is unambiguously labeled.** No native-ad camouflage. A
   sponsored placement in any surface must look different from organic
   content at first glance.
2. **The feed is the most expensive surface to monetize.** Once readers
   suspect their feed is shaped by who paid Hone, the social signal is
   compromised. Defer feed monetization until other levers are exhausted.
3. **Affiliate links are honest.** The user wanted to buy a book; Hone helps
   them do it; Hone earns a small commission. No behavior change required
   from the user, no signal degradation in the product.
4. **Privacy-derived revenue is off the table.** Selling user behavior data
   to publishers — even aggregated — is excluded without explicit per-user
   opt-in. The contacts-matching disclosure (Q9) sets the bar; everything
   else lives at or above it.
5. **Algorithmic ranking stays organic.** The Q14 chronological feed is not
   modified by paid placement. The ranking algorithm (Q16) is not modified
   by paid placement. Sponsored content lives in clearly-marked dedicated
   slots, not interleaved with ranked organic content.

## V1 Scope

Ship affiliate links. Nothing else.

- **Affiliate links on Book Detail.** `Buy` buttons on every book page route
  through affiliate URLs:
  - Bookshop.org (US/UK indie, ~10% commission, lowest trust cost)
  - Amazon Associates (4-8%, broadest catalog)
  - Audible / Libro.fm (audiobook tier, separate flow)
  - Apple Books (iOS deep link, modest commission, native feel)
- **Implementation cost:** one account per affiliate program, a URL
  templating helper in the API, and a config table mapping affiliate program
  preference per user locale. ~1 week build.
- **Realistic revenue:** $1-5 per buying user per year at small scale. Won't
  pay engineering salaries; will materially offset hosting once the user
  base is non-trivial.

## V2+ Levers

Listed roughly in order of trust cost, lowest first.

### Premium subscription (Hone Pro)

Recurring subscription, ad-free, with feature gates that don't compromise
the free experience.

- Candidate gated features: unlimited custom shelves (free tier capped at
  5-10), advanced reading analytics, year-in-review long-form, priority
  support, public creator profile (if creator monetization arrives later),
  data export.
- Price band to test: $4.99–$9.99/month, $39–$79/year.
- Trust cost: low if free tier remains genuinely useful. High if free is
  crippled to push upgrade.
- Revenue model: predictable, recurring, doesn't touch the social graph.

### Sponsored book placements in recommendation surfaces (not feed)

A publisher pays Hone to surface a new release in *recommendation*
surfaces — Discover tab, Book Detail "you might also like," post-finish
"next read" suggestions. Always labeled `Sponsored`. Never in the
chronological home feed.

- Why recs and not feed: a user opening Discover or scrolling related-books
  is in *acquisition mode* — they came looking for new books to read. A
  sponsored card here is closer to a search ad than a feed-injected
  marketing post. Trust cost is real but bounded.
- Why never in feed: the feed is "people I trust did things." Injecting
  paid placement there breaks the social signal at its source.
- Constraints worth committing to up front:
  - Sponsored placements never replace organic recommendations; they appear
    in *additional* slots (e.g. one sponsored card per Discover screen,
    never the top result).
  - Sponsored placements respect the user's stated taste (genre, length,
    format). A publisher can't buy placement in front of users whose taste
    profile doesn't match the book.
  - Users can mute sponsored content per advertiser, and a global "less
    sponsored content" toggle exists in Settings.
- Revenue band: highly variable; book publishing has thin marketing
  budgets compared to other verticals. Realistic v2 contribution: 10-30% of
  total revenue at small-to-mid scale.

### Creator marketplace

Power readers, influencers, or authors monetize via paid newsletters, paid
book lists, or affiliate-link revenue share. Hone takes a small cut.

- Surfaces this would need: public creator profile (already in the schema
  via Posture C public defaults), opt-in subscription mechanic, payout
  pipeline (Stripe Connect or similar), creator analytics.
- Trust cost: low if creators are clearly distinct from ordinary users and
  the social graph isn't touched.
- Revenue model: marketplace cut (10-15% Stripe-Connect-style).
- Notable: this is the lever that turns Hone from a closed-circle social
  app into a small media business. Compatible with the PRD's "future
  creator growth" direction but a meaningful cultural shift.

### Author tools

Authors claim their book's page. Pay for analytics: aggregate read counts,
score distributions, recent finishers (anonymized), genre overlap.

- Privacy-sensitive — must use the same hashed-cohort aggregation rules
  applied to public data only, never to mutuals-only or private content.
- Revenue band: niche but high-margin. $10-50/month per claimed author.

## Hard Nos

- **Display banner ads.** Tanks UX trust in a reading-focused product.
- **Native-style sponsored content in the chronological feed.**
- **Selling individual user behavior data to publishers** — even aggregated —
  without explicit per-user opt-in.
- **Paid promotion of users.** Verified-style status badges that can be
  bought, paid follower-count boosts, etc. The social graph is the moat.
- **Ranking-algorithm monetization.** No publisher pays to bias the
  recommendation algorithm itself.

## Considerations / Open Questions

- **App Store / Play Store cuts.** iOS in-app subscriptions take a 30% cut
  (15% after year one). For Hone Pro, web-based purchase via Stripe is
  cheaper but less convenient on mobile. Apple's anti-steering rules limit
  how much Hone can advertise the web option in-app.
- **International affiliate program coverage.** Bookshop.org is US/UK
  primarily. Amazon Associates has per-country variants requiring separate
  accounts. Plan for locale-aware affiliate routing from day 1 even if v1
  only enrolls US/UK programs.
- **Sponsored-rec genre matching trust.** If publishers can target by genre,
  what stops them from targeting users by mutual-friends-already-read? Need
  to publish targeting policy explicitly so users know what's used.
- **Dark patterns to avoid:** "Pay to remove the read-time limit" dark
  patterns, free-tier degradation over time, surprise ads in previously
  ad-free surfaces.

## Decision Sequence

Rough order in which the strategy doc should resolve into product
commitments:

1. v1 — affiliate links live (within v1 launch window).
2. v1.5 — Hone Pro subscription gated on a small set of clearly-additive
   premium features, after the free tier has matured.
3. v2 — sponsored placements in recommendation surfaces only, with the
   guardrails above.
4. v2+ — creator marketplace, only if and when the public-creator path is
   actually being walked.
5. Author tools — opportunistic; ship if a publisher relationship asks for
   it and the privacy guardrails hold.
