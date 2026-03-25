import { z } from "zod";

export const supportedImportFormats = [".csv", ".ofx"] as const;

const fileSchema = z.custom<File>(
  (value): value is File =>
    typeof File !== "undefined" && value instanceof File && value.size > 0,
  "Arquivo é obrigatório"
);

export const importTransactionsSchema = z.object({
  file: fileSchema,
  cardId: z.string().min(1, "cardId é obrigatório"),
  competencia: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z
      .string()
      .regex(/^\d{4}-\d{2}$/, "competencia deve estar no formato YYYY-MM")
      .optional()
  ),
});

export type ImportTransactionsInput = z.infer<typeof importTransactionsSchema>;
