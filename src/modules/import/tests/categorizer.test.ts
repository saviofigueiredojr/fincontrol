import { describe, it, expect, vi } from "vitest";
import { FallbackCategorizerService } from "../fallback-categorizer.service";
import { AiCategorizerService } from "../ai-categorizer.service";

describe("Import Categorizer Services", () => {
    describe("FallbackCategorizerService", () => {
        it("should correctly identify common standard descriptions deterministically", () => {
            expect(FallbackCategorizerService.categorize("PGTO EM IFOOD COMP")).toBe("Alimentação");
            expect(FallbackCategorizerService.categorize("UBER *TRIP 5B22")).toBe("Transporte");
            expect(FallbackCategorizerService.categorize("NETFLIX.COM")).toBe("Assinaturas");
            expect(FallbackCategorizerService.categorize("DROGASIL")).toBe("Saúde");
        });

        it("should trust the original card category if no local map fits and it's valid", () => {
            expect(FallbackCategorizerService.categorize("COMPRA A DEFINIR", "Serviços")).toBe("Serviços");
        });

        it("should return null for unknown weird strings", () => {
            expect(FallbackCategorizerService.categorize("TED SILVIO")).toBeNull();
            expect(FallbackCategorizerService.categorize("PIX QAJDHSAH2")).toBeNull();
        });
    });

    describe("AiCategorizerService", () => {
        it("should gracefully bypass if no API key is present", async () => {
            // Backup env
            const backup = process.env.GEMINI_API_KEY;
            delete process.env.GEMINI_API_KEY;

            const res = await AiCategorizerService.categorizeBatch(["UBER"], ["Transporte"]);
            expect(res).toEqual({});

            // Restore env
            if (backup) process.env.GEMINI_API_KEY = backup;
        });

        it("should gracefully bypass if arguments are empty", async () => {
            const res = await AiCategorizerService.categorizeBatch([], ["Transporte"]);
            expect(res).toEqual({});
        });
    });
});
