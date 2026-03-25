export class FallbackCategorizerService {
    /**
     * Fast, synchronous, deterministic categorization based on common Brazilian bank statement strings.
     * Ensures the import process doesn't completely fail or stay blind if the LLM API is down or unpaid.
     */
    static categorize(description: string, originalCategory?: string): string | null {
        const desc = description.toLowerCase();

        // Standard mappings
        if (desc.includes("ifood") || desc.includes("rappi") || desc.includes("uber eats") || desc.includes("mcdonalds") || desc.includes("burger king")) {
            return "Alimentação";
        }
        if (desc.includes("uber") || desc.includes("99app") || desc.includes("posto") || desc.includes("combustivel") || desc.includes("shell") || desc.includes("ipiranga")) {
            return "Transporte";
        }
        if (desc.includes("netflix") || desc.includes("spotify") || desc.includes("prime") || desc.includes("amazon") || desc.includes("apple") || desc.includes("globoplay")) {
            return "Assinaturas";
        }
        if (desc.includes("pgto") || desc.includes("pagamento") || desc.includes("fatura") || desc.includes("boleto") || desc.includes("recebimento")) {
            return "Transferência / Pagamento";
        }
        if (desc.includes("farmacia") || desc.includes("drogasil") || desc.includes("pague menos") || desc.includes("droga raia") || desc.includes("panvel")) {
            return "Saúde";
        }
        if (desc.includes("mercadolivre") || desc.includes("mercado livre") || desc.includes("magalu") || desc.includes("shopee")) {
            return "Compras";
        }
        if (desc.includes("smart fit") || desc.includes("bluefit") || desc.includes("academia")) {
            return "Esporte";
        }

        // If we have an original category provided by Inter CSV that belongs to a standard structure, we can trust it
        if (originalCategory && originalCategory.length > 2 && originalCategory !== "Outros") {
            return originalCategory;
        }

        return null; // Signals the engine to escalate to LLM Custom categorization or fallback to 'Outros'
    }
}
