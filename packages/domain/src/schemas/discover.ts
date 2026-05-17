import { z } from "zod";
import { EntityIdSchema } from "./auth";

/**
 * Source attribution for a People-You-May-Know suggestion.
 *
 * - `"contacts"` — surfaced via phone-hash overlap against the viewer's
 *   uploaded contacts (#96).
 * - `"fof"` — surfaced because the viewer follows users who follow this
 *   profile (friend-of-friend).
 * - `"both"` — present in both candidate sources.
 */
export const PeopleYouMayKnowSourceSchema = z.enum(["contacts", "fof", "both"]);

/**
 * Minimal public-profile shape returned by `discover.peopleYouMayKnow`
 * (#144, P-08).
 *
 * Posture C: identity fields (handle, displayName, avatarUrl) default to
 * `public` and surface here for any candidate whose `identity` visibility
 * check passes for the viewer's relationship. `mutualCount` is the count
 * of mutual follows between the viewer and the candidate, used to rank
 * suggestions and shown alongside friend-of-friend chrome on the client.
 */
export const PeopleYouMayKnowProfileSchema = z.object({
  profileId: EntityIdSchema,
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  mutualCount: z.number().int().min(0).optional(),
  source: PeopleYouMayKnowSourceSchema,
});

/**
 * tRPC input for `discover.peopleYouMayKnow`.
 *
 * Caps the result list at 50 (matches the recommendations surface) and
 * defaults to 20 — a reasonable Discover-tab page size that fits a couple
 * of screens on mobile.
 */
export const PeopleYouMayKnowInputSchema = z.object({
  limit: z.number().int().positive().max(50).default(20),
});

export const PeopleYouMayKnowOutputSchema = z.object({
  suggestions: z.array(PeopleYouMayKnowProfileSchema),
});

export type PeopleYouMayKnowSource = z.infer<typeof PeopleYouMayKnowSourceSchema>;
export type PeopleYouMayKnowProfile = z.infer<typeof PeopleYouMayKnowProfileSchema>;
export type PeopleYouMayKnowInput = z.infer<typeof PeopleYouMayKnowInputSchema>;
export type PeopleYouMayKnowOutput = z.infer<typeof PeopleYouMayKnowOutputSchema>;
