-- Recalculate existing statement totals from their linked transactions.
UPDATE "CardStatement" AS statement
SET "totalAmount" = COALESCE(totals.total, 0)
FROM (
  SELECT
    statement.id,
    COALESCE(SUM(tx.amount), 0) AS total
  FROM "CardStatement" AS statement
  LEFT JOIN "Transaction" AS tx
    ON tx."cardStatementId" = statement.id
  GROUP BY statement.id
) AS totals
WHERE statement.id = totals.id;
