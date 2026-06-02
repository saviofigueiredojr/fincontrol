import { z } from "zod";

const idSchema = z.string().trim().min(1);

export const registerPluggyItemSchema = z.object({
  itemId: idSchema,
});

export const updatePluggyAccountSchema = z.object({
  pluggyAccountId: idSchema,
  linkedCreditCardId: z.string().trim().min(1).nullable().optional(),
});

export const listPluggyCandidatesQuerySchema = z.object({
  accountId: idSchema.optional(),
  status: z.enum(["pending", "imported", "ignored", "all"]).optional().default("pending"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(80),
});

export const importPluggyTransactionsSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
  ownership: z.enum(["mine", "partner", "joint"]).optional().default("joint"),
});

export const ignorePluggyTransactionsSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
  ignored: z.boolean().optional().default(true),
});

export const syncPluggyItemSchema = z.object({
  itemId: idSchema.optional(),
});

export type RegisterPluggyItemInput = z.infer<typeof registerPluggyItemSchema>;
export type UpdatePluggyAccountInput = z.infer<typeof updatePluggyAccountSchema>;
export type ImportPluggyTransactionsInput = z.infer<typeof importPluggyTransactionsSchema>;
export type IgnorePluggyTransactionsInput = z.infer<typeof ignorePluggyTransactionsSchema>;
