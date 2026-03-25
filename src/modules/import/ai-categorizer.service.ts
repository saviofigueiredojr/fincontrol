import { GoogleGenerativeAI } from "@google/generative-ai";

export class AiCategorizerService {
    /**
     * Submits a batch of unknown descriptions to the Gemini LLM for structured categorization.
     * Fails gracefully to a safe default if the API key is missing or the network drops.
     */
    static async categorizeBatch(
        descriptions: string[],
        validCategories: string[]
    ): Promise<Record<string, string>> {
        if (!process.env.GEMINI_API_KEY || descriptions.length === 0) {
            return {}; // Fallback mapping bypass
        }

        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            // Using responseMimeType JSON to force structured outputs reliably
            const model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            // Crafting prompt restricting to the valid dynamic targets of the Household
            const prompt = `Atue como um analista financeiro experiente.
        Classifique as seguintes transações descritas em uma nota bancária em APENAS UMA das seguintes categorias permitidas: [${validCategories.join(", ")}].
        Se a transação for totalmente desconhecida, use "Outros". Use o bom senso brasileiro.
        
        Transações (descrições cruas):
        ${descriptions.join("\n")}
        
        Retorne um texto que seja válido JSON puro no formato extado abaixo sem acentos nas chaves:
        { "resultados": [{ "descricao": "nome original exato fornecido", "categoria": "nome_da_categoria_da_lista" }] }
        `;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const parsed = JSON.parse(text);

            const mapping: Record<string, string> = {};
            if (parsed.resultados && Array.isArray(parsed.resultados)) {
                for (const item of parsed.resultados) {
                    mapping[item.descricao] = item.categoria;
                }
            }

            return mapping;
        } catch (error) {
            console.error("[AiCategorizerService] Gemini Execution failed. Gracefully defaulting back to Outros.", error);
            return {};
        }
    }
}
