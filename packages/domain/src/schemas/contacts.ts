import { z } from "zod";
import { EntityIdSchema } from "./auth";

/**
 * Maximum number of contact hashes allowed per upload batch.
 * Caps memory and database load from a single request.
 */
export const CONTACTS_BATCH_MAX = 1000;

const ContactHashEntrySchema = z.object({
  hash: z.string().min(1),
  saltVersion: z.number().int().min(0),
  expiresAt: z.coerce.date(),
});

export const ContactsUploadInputSchema = z.object({
  saltVersion: z.number().int().min(0),
  phoneHashes: z.array(ContactHashEntrySchema).max(CONTACTS_BATCH_MAX).optional().default([]),
  emailHashes: z.array(ContactHashEntrySchema).max(CONTACTS_BATCH_MAX).optional().default([]),
});

export const ContactsUploadOutputSchema = z.object({
  success: z.boolean(),
  phonesUploaded: z.number().int(),
  emailsUploaded: z.number().int(),
});

export const ContactsMatchInputSchema = z.object({}).optional().default({});

/**
 * Minimal public-profile shape returned by `contacts.match`.
 *
 * Posture C: identity fields (handle, displayName, avatarUrl) default to
 * `public` and are surfaced on the contacts-match surface for any profile
 * whose `identity` visibility check passes for the viewer's relationship.
 *
 * `mutualCount` is the number of mutual follows between the viewer and the
 * matched profile, when available. Useful for ranking the People You May
 * Know surface.
 */
export const ContactsMatchProfileSchema = z.object({
  profileId: EntityIdSchema,
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  mutualCount: z.number().int().min(0).optional(),
});

export const ContactsMatchOutputSchema = z.object({
  matches: z.array(ContactsMatchProfileSchema),
});

export const ContactsDeleteInputSchema = z.object({});

export const ContactsDeleteOutputSchema = z.object({
  success: z.boolean(),
});

export type ContactsUploadInput = z.infer<typeof ContactsUploadInputSchema>;
export type ContactsUploadOutput = z.infer<typeof ContactsUploadOutputSchema>;
export type ContactsMatchInput = z.infer<typeof ContactsMatchInputSchema>;
export type ContactsMatchProfile = z.infer<typeof ContactsMatchProfileSchema>;
export type ContactsMatchOutput = z.infer<typeof ContactsMatchOutputSchema>;
export type ContactsDeleteInput = z.infer<typeof ContactsDeleteInputSchema>;
export type ContactsDeleteOutput = z.infer<typeof ContactsDeleteOutputSchema>;
