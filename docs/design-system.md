# Hone Design System Direction

## Summary

Hone should feel minimal, quiet, and distinctly Japanese without becoming themed decoration. The visual system should borrow from washi paper, shoji grids, sumi ink, editorial book design, and restrained vermilion seals.

The product should feel like a calm reading object: lots of air, fine rules, precise typography, and small moments of warmth.

## Principles

- **Ma / negative space**: give screens room to breathe.
- **Paper over canvas**: never use pure white; use a light washi/rice-paper base.
- **Lines over cards**: prefer thin rules, sections, and quiet tables over heavy cards.
- **Accent sparingly**: vermilion and ai indigo should mark hierarchy, not decorate everything.
- **Japanese, not ornamental**: avoid generic lanterns, waves, blobs, faux brush fonts, or overused motifs.
- **Function stays first**: social reading and ranking flows should remain clear and fast.

## Color Tokens

- `Rice Paper`: `#F7F4ED`
- `Panel Paper`: `#FBFAF6`
- `Paper Rule`: `#E5DFD3`
- `Sumi Ink`: `#171411`
- `Soft Ink`: `#676158`
- `Ai Indigo`: `#253F5B`
- `Vermilion Seal`: `#B9472D`

Usage:

- Background: `Rice Paper`
- Elevated/contained surfaces: `Panel Paper`
- Dividers and grid lines: `Paper Rule` or `Sumi Ink`
- Primary text: `Sumi Ink`
- Secondary text: `Soft Ink`
- Navigation/metadata accents: `Ai Indigo`
- Score/brand seal accent: `Vermilion Seal`

## Typography

- Web display: `Noto Serif JP`
- Web body/UI: `Noto Sans`
- Native display fallback: platform serif
- Native body/UI: platform sans

Type should be calm and readable. Avoid oversized decorative display treatment except for hero/product moments.

## Components

- Use 1px rules for section boundaries.
- Avoid drop shadows by default.
- Avoid heavy rounded cards.
- Use square or very subtle radius only when functionally needed.
- Use compact metadata labels with letter spacing for hierarchy.
- Score badges should be typographic, not pill-shaped.

## Layout

- Use shoji-like grids and columns.
- Keep spacing generous but consistent.
- Prefer table/list structures for activity and rankings.
- Mobile should feel like a clean reading log.
- Web should feel like an editorial index/public reading profile.

## Avoid

- Beige-heavy palettes.
- White backgrounds.
- Chunky hand-drawn borders.
- Decorative orbs/blobs.
- Generic folk-art shapes unless they have a clear system role.
- Multiple competing accent colors on one screen.

