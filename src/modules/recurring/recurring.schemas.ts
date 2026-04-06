import { z } from "zod";

const competenciaRegex = /^\d{4}-\d{2}$/;

export const recurringTypeSchema = z.enum(["income", "expense"]);
export const recurringOwnershipSchema = z.enum(["mine", "partner", "joint"]);
export const recurringIntervalSchema = z.enum(["monthly", "yearly"]);

export const createRecurringSchema = z
  .object({
    description: z.string().trim().min(1, "description is required"),
    category: z.string().trim().min(1, "category is required"),
    amount: z.number().positive("amount must be a positive number"),
    type: recurringTypeSchema,
    ownership: recurringOwnershipSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: z.string().regex(competenciaRegex, "startDate must use YYYY-MM"),
    endDate: z.string().regex(competenciaRegex, "endDate must use YYYY-MM").nullable().optional(),
    interval: recurringIntervalSchema.optional().default("monthly"),
    intervalCount: z.number().int().min(1).optional().default(1),
    isVariable: z.boolean().optional().default(false),
    cardId: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.cardId && value.type !== "expense") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Somente despesas podem ser vinculadas a cartão de crédito",
        path: ["cardId"],
      });
    }
  });

export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
