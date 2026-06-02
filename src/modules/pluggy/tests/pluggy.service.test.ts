import { describe, expect, it } from "vitest";
import {
  canAutoImportStagedTransaction,
  dateToCompetencia,
  inferTransactionType,
  mapPluggyCategory,
} from "../pluggy.service";

describe("Pluggy service helpers", () => {
  it("infers expenses and incomes from Pluggy transaction shape", () => {
    expect(inferTransactionType({ amount: -42.5, type: null })).toBe("expense");
    expect(inferTransactionType({ amount: 100, type: null })).toBe("income");
    expect(inferTransactionType({ amount: 100, type: "DEBIT" })).toBe("expense");
    expect(inferTransactionType({ amount: -100, type: "CREDIT" })).toBe("income");
  });

  it("maps common Pluggy categories to FinControl categories", () => {
    expect(mapPluggyCategory("Food and Drink")).toBe("Alimentação");
    expect(mapPluggyCategory({ id: "1", description: "Transport" })).toBe("Transporte");
    expect(mapPluggyCategory({ id: "2", name: "Health" })).toBe("Saúde");
    expect(mapPluggyCategory(null)).toBe("Outros");
  });

  it("converts transaction dates to competencia", () => {
    expect(dateToCompetencia("2026-06-01")).toBe("2026-06");
    expect(dateToCompetencia(new Date(2026, 6, 12))).toBe("2026-07");
  });

  it("only auto-imports pending expenses from linked credit-card accounts", () => {
    const base = {
      importedTransactionId: null,
      ignoredAt: null,
      suggestedType: "expense",
      account: {
        type: "CREDIT",
        linkedCreditCardId: "card-1",
      },
    };

    expect(canAutoImportStagedTransaction(base)).toBe(true);
    expect(
      canAutoImportStagedTransaction({
        ...base,
        suggestedType: "income",
      })
    ).toBe(false);
    expect(
      canAutoImportStagedTransaction({
        ...base,
        importedTransactionId: "tx-1",
      })
    ).toBe(false);
    expect(
      canAutoImportStagedTransaction({
        ...base,
        account: { type: "BANK", linkedCreditCardId: null },
      })
    ).toBe(false);
  });
});
