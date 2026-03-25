import { z } from "zod";

export const competenciaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Formato de competência inválido (YYYY-MM)");

export const monthQuerySchema = z.object({
  competencia: competenciaSchema,
});

export const closeMonthSchema = z.object({
  competencia: competenciaSchema,
  metaAllocation: z.coerce
    .number()
    .finite("metaAllocation deve ser um número válido")
    .min(0, "metaAllocation deve ser maior ou igual a zero")
    .default(0),
});

export const reopenMonthParamsSchema = z.object({
  competencia: competenciaSchema,
});

export type CloseMonthInput = z.infer<typeof closeMonthSchema>;
