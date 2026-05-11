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

export const ContactsMatchInputSchema = z.object({
  phoneHashes: z.array(z.string().min(1)).optional().default([]),
  emailHashes: z.array(z.string().min(1)).optional().default([]),
});

export const ContactsMatchOutputSchema = z.object({
  matches: z.array(EntityIdSchema),
});

export const ContactsDeleteInputSchema = z.object({});

export const ContactsDeleteOutputSchema = z.object({
  success: z.boolean(),
});

export type ContactsUploadInput = z.infer<typeof ContactsUploadInputSchema>;
export type ContactsUploadOutput = z.infer<typeof ContactsUploadOutputSchema>;
export type ContactsMatchInput = z.infer<typeof ContactsMatchInputSchema>;
export type ContactsMatchOutput = z.infer<typeof ContactsMatchOutputSchema>;
export type ContactsDeleteInput = z.infer<typeof ContactsDeleteInputSchema>;
export type ContactsDeleteOutput = z.infer<typeof ContactsDeleteOutputSchema>;
