export class FallbackCategorizerService {
  static categorize(description: string, originalCategory?: string): string | null {
    const desc = description.toLowerCase();
    const normalizedOriginal = originalCategory?.trim().toUpperCase();

    const interCategoryMap: Record<string, string> = {
      RESTAURANTES: "Alimentação",
      SUPERMERCADO: "Alimentação",
      TRANSPORTE: "Transporte",
      SERVICOS: "Serviços",
      COMPRAS: "Compras",
      VESTUARIO: "Compras",
      CONSTRUCAO: "Compras",
      DROGARIA: "Saúde",
      SAUDE: "Saúde",
      EDUCACAO: "Educação",
      MORADIA: "Moradia",
      PAGAMENTOS: "Transferência / Pagamento",
      VIAGEM: "Lazer",
      OUTROS: "Outros",
    };

    if (normalizedOriginal && interCategoryMap[normalizedOriginal]) {
      return interCategoryMap[normalizedOriginal];
    }

    if (
      desc.includes("ifood") ||
      desc.includes("rappi") ||
      desc.includes("uber eats") ||
      desc.includes("mcdonalds") ||
      desc.includes("burger king") ||
      desc.includes("mercado") ||
      desc.includes("supermercado")
    ) {
      return "Alimentação";
    }

    if (
      desc.includes("uber") ||
      desc.includes("99app") ||
      desc.includes("posto") ||
      desc.includes("combustivel") ||
      desc.includes("shell") ||
      desc.includes("ipiranga")
    ) {
      return "Transporte";
    }

    if (
      desc.includes("netflix") ||
      desc.includes("spotify") ||
      desc.includes("prime") ||
      desc.includes("amazon prime") ||
      desc.includes("globoplay")
    ) {
      return "Assinaturas";
    }

    if (
      desc.includes("pgto") ||
      desc.includes("pagamento") ||
      desc.includes("fatura") ||
      desc.includes("boleto") ||
      desc.includes("recebimento")
    ) {
      return "Transferência / Pagamento";
    }

    if (
      desc.includes("farmacia") ||
      desc.includes("drogasil") ||
      desc.includes("pague menos") ||
      desc.includes("droga raia") ||
      desc.includes("panvel")
    ) {
      return "Saúde";
    }

    if (
      desc.includes("mercadolivre") ||
      desc.includes("mercado livre") ||
      desc.includes("magalu") ||
      desc.includes("shopee")
    ) {
      return "Compras";
    }

    return "Outros";
  }
}
