import { z } from "zod";

export const updatePlanningDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Informe um título com pelo menos 3 caracteres")
    .max(120, "O título deve ter no máximo 120 caracteres"),
  content: z
    .string()
    .trim()
    .min(1, "O planejamento não pode ficar vazio")
    .max(50000, "O planejamento deve ter no máximo 50.000 caracteres"),
});

export type UpdatePlanningDocumentInput = z.infer<
  typeof updatePlanningDocumentSchema
>;
