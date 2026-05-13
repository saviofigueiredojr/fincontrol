import { describe, expect, it, vi } from "vitest";
import { refreshCardStatementTotals } from "../card-statements";

describe("refreshCardStatementTotals", () => {
  it("recalcula totais a partir das transacoes vinculadas", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: 100.25 }, { amount: 49.75 }]);
    const update = vi.fn().mockResolvedValue({});
    const db = {
      transaction: { findMany },
      cardStatement: { update },
    };

    await refreshCardStatementTotals(db as any, ["statement-1", "statement-1", null]);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: { cardStatementId: "statement-1" },
      select: { amount: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "statement-1" },
      data: { totalAmount: 150 },
    });
  });

  it("zera o total quando a fatura fica sem transacoes", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const update = vi.fn().mockResolvedValue({});
    const db = {
      transaction: { findMany },
      cardStatement: { update },
    };

    await refreshCardStatementTotals(db as any, ["statement-empty"]);

    expect(update).toHaveBeenCalledWith({
      where: { id: "statement-empty" },
      data: { totalAmount: 0 },
    });
  });
});
