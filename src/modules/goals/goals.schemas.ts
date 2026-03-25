import { z } from "zod";

const deadlineSchema = z
  .union([z.string().trim().min(1), z.literal(""), z.null()])
  .optional();

export const updateGoalSchema = z.object({
  id: z.string().min(1, "id é obrigatório"),
  name: z.string().trim().min(1, "name não pode ser vazio").optional(),
  targetAmount: z
    .number()
    .finite("targetAmount deve ser um número válido")
    .min(0, "targetAmount deve ser um número positivo")
    .optional(),
  currentAmount: z
    .number()
    .finite("currentAmount deve ser um número válido")
    .min(0, "currentAmount deve ser um número positivo")
    .optional(),
  deadline: deadlineSchema,
});

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
