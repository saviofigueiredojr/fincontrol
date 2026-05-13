import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transactionFindFirst: vi.fn(),
  transactionUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
  getOrCreateCardStatement: vi.fn(),
  getScopedCreditCard: vi.fn(),
  refreshCardStatementTotals: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: {
      findFirst: mocks.transactionFindFirst,
    },
    $transaction: mocks.prismaTransaction,
  },
}));

vi.mock("@/lib/card-statements", () => ({
  getOrCreateCardStatement: mocks.getOrCreateCardStatement,
  getScopedCreditCard: mocks.getScopedCreditCard,
  refreshCardStatementTotals: mocks.refreshCardStatementTotals,
}));

import { updateScopedTransaction } from "../transactions.service";

describe("updateScopedTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prismaTransaction.mockImplementation(async (callback) =>
      callback({
        transaction: {
          update: mocks.transactionUpdate,
        },
      })
    );
  });

  it("refreshes both old and new statements when a card transaction changes competencia", async () => {
    mocks.transactionFindFirst.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      competencia: "2026-05",
      isRecurring: false,
      recurringId: null,
      cardStatementId: "statement-old",
      cardStatement: {
        id: "statement-old",
        cardId: "card-1",
      },
    });
    mocks.getScopedCreditCard.mockResolvedValue({ id: "card-1" });
    mocks.getOrCreateCardStatement.mockResolvedValue({ id: "statement-new" });
    mocks.transactionUpdate.mockResolvedValue({
      id: "tx-1",
      cardStatementId: "statement-new",
    });

    const result = await updateScopedTransaction(
      {
        userId: "user-1",
        userRole: "member",
        memberIds: ["user-1", "user-2"],
      },
      "tx-1",
      { competencia: "2026-06" }
    );

    expect(result.kind).toBe("ok");
    expect(mocks.transactionUpdate).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: {
        competencia: "2026-06",
        cardStatementId: "statement-new",
      },
    });
    expect(mocks.refreshCardStatementTotals).toHaveBeenCalledWith(
      expect.any(Object),
      ["statement-old", "statement-new"]
    );
  });
});
