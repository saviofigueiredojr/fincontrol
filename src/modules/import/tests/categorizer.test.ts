import { describe, it, expect } from "vitest";
import { FallbackCategorizerService } from "../fallback-categorizer.service";

describe("FallbackCategorizerService", () => {
  it("categoriza descricoes comuns de forma deterministica", () => {
    expect(FallbackCategorizerService.categorize("PGTO EM IFOOD COMP")).toBe("Alimentação");
    expect(FallbackCategorizerService.categorize("UBER *TRIP 5B22")).toBe("Transporte");
    expect(FallbackCategorizerService.categorize("NETFLIX.COM")).toBe("Assinaturas");
    expect(FallbackCategorizerService.categorize("DROGASIL")).toBe("Saúde");
  });

  it("normaliza categorias conhecidas do Inter", () => {
    expect(FallbackCategorizerService.categorize("COMPRA A DEFINIR", "SERVICOS")).toBe("Serviços");
    expect(FallbackCategorizerService.categorize("COMPRA A DEFINIR", "SUPERMERCADO")).toBe("Alimentação");
    expect(FallbackCategorizerService.categorize("COMPRA A DEFINIR", "TRANSPORTE")).toBe("Transporte");
  });

  it("cai para Outros quando nao ha correspondencia segura", () => {
    expect(FallbackCategorizerService.categorize("TED SILVIO")).toBe("Outros");
    expect(FallbackCategorizerService.categorize("PIX QAJDHSAH2")).toBe("Outros");
  });
});
