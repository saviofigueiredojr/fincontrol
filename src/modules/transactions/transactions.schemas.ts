import { z } from "zod";

const competenciaRegex = /^\d{4}-\d{2}$/;

export const transactionTypeSchema = z.enum(["income", "expense", "transfer"]);
export const transactionOwnershipSchema = z.enum(["mine", "partner", "joint"]);

const optionalString = z.string().trim().min(1).optional();

export const listTransactionsQuerySchema = z.object({
  competencia: z.string().regex(competenciaRegex).optional(),
  ownership: transactionOwnershipSchema.optional(),
  type: transactionTypeSchema.optional(),
  category: optionalString,
  search: optionalString,
});

const transactionDateSchema = z
  .string()
  .min(1, "date is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "date must be valid");

export const createTransactionSchema = z.object({
  date: transactionDateSchema,
  competencia: z.string().regex(competenciaRegex, "competencia must use YYYY-MM"),
  description: z.string().trim().min(1, "description is required"),
  category: z.string().trim().min(1, "category is required"),
  amount: z.number().positive("amount must be a positive number"),
  type: transactionTypeSchema,
  ownership: transactionOwnershipSchema,
  installmentCurrent: z.number().int().positive().nullable().optional(),
  installmentTotal: z.number().int().positive().nullable().optional(),
  source: z.string().trim().min(1).optional().default("manual"),
  isSecret: z.boolean().optional().default(false),
});

export const updateTransactionSchema = z
  .object({
    date: transactionDateSchema.optional(),
    competencia: z.string().regex(competenciaRegex).optional(),
    description: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
    type: transactionTypeSchema.optional(),
    ownership: transactionOwnershipSchema.optional(),
    installmentCurrent: z.number().int().positive().nullable().optional(),
    installmentTotal: z.number().int().positive().nullable().optional(),
    source: z.string().trim().min(1).optional(),
    cardStatementId: z.string().trim().min(1).nullable().optional(),
    isRecurring: z.boolean().optional(),
    recurringId: z.string().trim().min(1).nullable().optional(),
    isSecret: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
