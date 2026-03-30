import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shiftCompetencia } from "@/lib/utils";
import { ImportTransactionsInput, supportedImportFormats } from "./import.schemas";
import { FallbackCategorizerService } from "./fallback-categorizer.service";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

function normalizeStatementContent(content: string) {
  return content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseBRLCurrency(value: string): number {
  const cleaned = value.replace(/R\$\s*/g, "").trim();
  const isNegative = cleaned.startsWith("-");
  const absoluteValue = cleaned
    .replace("-", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = parseFloat(absoluteValue);
  return isNegative ? -parsed : parsed;
}

function parseBRDate(value: string): Date {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function parseInstallment(tipo: string) {
  const match = tipo.match(/Parcela\s+(\d+)\/(\d+)/i);

  if (!match) {
    return null;
  }

  return {
    current: parseInt(match[1], 10),
    total: parseInt(match[2], 10),
  };
}

function competenciaFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDateForCompetencia(competencia: string, referenceDay: number) {
  const [year, month] = competencia.split("-").map(Number);
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(referenceDay, 1), maxDay);
  return new Date(year, month - 1, safeDay);
}

function parseCSVLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  result.push(current);
  return result.map((value) => value.replace(/^"|"$/g, "").trim());
}

function extractOFXField(block: string, field: string) {
  const xmlRegex = new RegExp(`<${field}>([^<]*)</${field}>`, "i");
  const xmlMatch = block.match(xmlRegex);

  if (xmlMatch) {
    return xmlMatch[1].trim();
  }

  const sgmlRegex = new RegExp(`<${field}>(.+)`, "i");
  const sgmlMatch = block.match(sgmlRegex);

  if (sgmlMatch) {
    return sgmlMatch[1].trim();
  }

  return null;
}

function getImportFormat(fileName: string) {
  const normalized = fileName.toLowerCase();
  const match = supportedImportFormats.find((extension) =>
    normalized.endsWith(extension)
  );

  return match ?? null;
}

async function getOrCreateStatement(
  db: DatabaseClient,
  cardId: string,
  competencia: string
) {
  const existing = await db.cardStatement.findUnique({
    where: { cardId_competencia: { cardId, competencia } },
  });

  if (existing) {
    return existing;
  }

  return db.cardStatement.create({
    data: {
      cardId,
      competencia,
      totalAmount: 0,
      status: "open",
    },
  });
}

async function refreshStatementTotals(
  db: DatabaseClient,
  statementIds: string[]
) {
  const uniqueIds = Array.from(new Set(statementIds));

  await Promise.all(
    uniqueIds.map(async (statementId) => {
      const transactions = await db.transaction.findMany({
        where: { cardStatementId: statementId },
        select: { amount: true },
      });

      const totalAmount = transactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0
      );

      await db.cardStatement.update({
        where: { id: statementId },
        data: { totalAmount },
      });
    })
  );
}

async function resetImportedCompetencia(
  db: DatabaseClient,
  cardId: string,
  competencia: string
) {
  const statement = await db.cardStatement.findUnique({
    where: { cardId_competencia: { cardId, competencia } },
  });

  if (!statement) {
    return [];
  }

  const parentTransactions = await db.transaction.findMany({
    where: { cardStatementId: statement.id },
    select: { id: true, parentId: true },
  });

  const parentIds = parentTransactions.map((transaction) => transaction.id);
  const rootParentIds = Array.from(
    new Set(
      parentTransactions
        .map((transaction) => transaction.parentId)
        .filter((parentId): parentId is string => Boolean(parentId))
    )
  );

  if (rootParentIds.length > 0) {
    await db.transaction.deleteMany({
      where: {
        parentId: { in: rootParentIds },
        competencia: { gte: competencia },
      },
    });
  }

  if (parentIds.length > 0) {
    await db.transaction.deleteMany({
      where: {
        parentId: { in: parentIds },
      },
    });
  }

  await db.transaction.deleteMany({
    where: { cardStatementId: statement.id },
  });

  await db.cardStatement.update({
    where: { id: statement.id },
    data: { totalAmount: 0 },
  });

  return [statement.id];
}

async function removeManualStatementPlaceholders(
  db: DatabaseClient,
  userId: string,
  cardName: string,
  competencias: string[]
) {
  if (competencias.length === 0) {
    return;
  }

  await db.transaction.deleteMany({
    where: {
      userId,
      source: "manual",
      cardStatementId: null,
      competencia: { in: Array.from(new Set(competencias)) },
      category: {
        in: ["Cartão de Crédito", "Cartao de Credito"],
      },
      description: {
        startsWith: `Fatura ${cardName}`,
        mode: "insensitive",
      },
    },
  });
}

async function importInterCsv(
  db: DatabaseClient,
  content: string,
  cardId: string,
  userId: string,
  cardName: string,
  selectedCompetencia?: string
) {
  const lines = normalizeStatementContent(content)
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { count: 0, statementIds: [] as string[] };
  }

  const dataLines = lines.slice(1);
  const statementCache = new Map<string, Awaited<ReturnType<typeof getOrCreateStatement>>>();

  async function getStatement(competencia: string) {
    const cached = statementCache.get(competencia);
    if (cached) {
      return cached;
    }

    const statement = await getOrCreateStatement(db, cardId, competencia);
    statementCache.set(competencia, statement);
    return statement;
  }

  const parsedRows = [];
  for (const line of dataLines) {
    const columns = parseCSVLine(line);
    if (columns.length < 5) continue;

    const [dateValue, description, category, tipo, amountValue] = columns;
    const amount = parseBRLCurrency(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (!description.trim()) continue;

    const date = parseBRDate(dateValue);
    if (Number.isNaN(date.getTime())) continue;

    const competencia = selectedCompetencia || competenciaFromDate(date);
    const installment = parseInstallment(tipo);

    parsedRows.push({
      date: getDateForCompetencia(competencia, date.getDate()),
      referenceDay: date.getDate(),
      description: description.trim(),
      rawCategory: category.trim(),
      amount,
      competencia,
      installment,
      tipo
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("Nenhuma transação válida encontrada no CSV enviado.");
  }

  const touchedCompetencias = new Set(parsedRows.map((row) => row.competencia));
  for (const row of parsedRows) {
    if (!row.installment) continue;

    for (
      let installmentIndex = row.installment.current + 1;
      installmentIndex <= row.installment.total;
      installmentIndex += 1
    ) {
      touchedCompetencias.add(
        shiftCompetencia(row.competencia, installmentIndex - row.installment.current)
      );
    }
  }

  await removeManualStatementPlaceholders(
    db,
    userId,
    cardName,
    Array.from(touchedCompetencias)
  );

  const statementIds: string[] = [];
  let count = 0;

  for (const row of parsedRows) {
    const finalCategory =
      FallbackCategorizerService.categorize(row.description, row.rawCategory) || "Outros";

    const statement = await getStatement(row.competencia);
    statementIds.push(statement.id);

    const mainTransaction = await db.transaction.create({
      data: {
        date: row.date,
        competencia: row.competencia,
        description: row.description,
        category: finalCategory,
        amount: row.amount,
        type: "expense",
        ownership: "mine",
        installmentCurrent: row.installment?.current ?? null,
        installmentTotal: row.installment?.total ?? null,
        source: "csv_inter",
        cardStatementId: statement.id,
        userId,
      },
    });

    count += 1;

    if (row.installment && row.installment.current < row.installment.total) {
      for (
        let installmentIndex = row.installment.current + 1;
        installmentIndex <= row.installment.total;
        installmentIndex += 1
      ) {
        const futureCompetencia = shiftCompetencia(
          row.competencia,
          installmentIndex - row.installment.current
        );
        const futureDate = getDateForCompetencia(
          futureCompetencia,
          row.referenceDay
        );
        const futureStatement = await getStatement(futureCompetencia);

        statementIds.push(futureStatement.id);

        await db.transaction.create({
          data: {
            date: futureDate,
            competencia: futureCompetencia,
            description: `${row.description} (${installmentIndex}/${row.installment.total})`,
            category: finalCategory,
            amount: row.amount,
            type: "expense",
            ownership: "mine",
            installmentCurrent: installmentIndex,
            installmentTotal: row.installment.total,
            parentId: mainTransaction.id,
            source: "csv_inter",
            cardStatementId: futureStatement.id,
            userId,
          },
        });

        count += 1;
      }
    }
  }

  return { count, statementIds };
}

async function importOfx(
  db: DatabaseClient,
  content: string,
  cardId: string,
  userId: string,
  cardName: string,
  selectedCompetencia?: string
) {
  const statementCache = new Map<string, Awaited<ReturnType<typeof getOrCreateStatement>>>();
  const normalizedContent = normalizeStatementContent(content);
  const transactionRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  const parsedRows = [];

  async function getStatement(competencia: string) {
    const cached = statementCache.get(competencia);
    if (cached) {
      return cached;
    }

    const statement = await getOrCreateStatement(db, cardId, competencia);
    statementCache.set(competencia, statement);
    return statement;
  }

  while ((match = transactionRegex.exec(normalizedContent)) !== null) {
    const block = match[1];
    const postedAt = extractOFXField(block, "DTPOSTED");
    const rawAmount = extractOFXField(block, "TRNAMT");
    const description =
      extractOFXField(block, "NAME") ||
      extractOFXField(block, "MEMO") ||
      "Importado OFX";

    if (!postedAt || !rawAmount) continue;

    const year = parseInt(postedAt.substring(0, 4), 10);
    const month = parseInt(postedAt.substring(4, 6), 10);
    const day = parseInt(postedAt.substring(6, 8), 10);
    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) continue;

    const parsedAmount = parseFloat(rawAmount);
    parsedRows.push({
      date: getDateForCompetencia(
        selectedCompetencia || competenciaFromDate(date),
        date.getDate()
      ),
      description: description.trim(),
      amount: Math.abs(parsedAmount),
      rawAmount: parsedAmount,
      competencia: selectedCompetencia || competenciaFromDate(date),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("Nenhuma transação válida encontrada no OFX enviado.");
  }

  await removeManualStatementPlaceholders(
    db,
    userId,
    cardName,
    parsedRows.map((row) => row.competencia)
  );

  const statementIds: string[] = [];
  let count = 0;

  for (const row of parsedRows) {
    const finalCategory =
      FallbackCategorizerService.categorize(row.description) || "Outros";

    const statement = await getStatement(row.competencia);
    statementIds.push(statement.id);

    await db.transaction.create({
      data: {
        date: row.date,
        competencia: row.competencia,
        description: row.description,
        category: finalCategory,
        amount: row.amount,
        type: row.rawAmount >= 0 ? "income" : "expense",
        ownership: "mine",
        source: "ofx",
        cardStatementId: statement.id,
        userId,
      },
    });

    count += 1;
  }

  return { count, statementIds };
}

export async function importTransactionsFromStatement(
  userId: string,
  input: ImportTransactionsInput
) {
  const importFormat = getImportFormat(input.file.name);

  if (!importFormat) {
    return { kind: "unsupported_format" as const };
  }

  const card = await prisma.creditCard.findFirst({
    where: {
      id: input.cardId,
      userId,
    },
    select: { id: true, name: true },
  });

  if (!card) {
    return { kind: "card_not_found" as const };
  }

  const content = await input.file.text();

  const result = await prisma.$transaction(async (db) => {
    const statementIdsToRefresh: string[] = [];

    if (input.competencia) {
      const resetStatementIds = await resetImportedCompetencia(
        db,
        input.cardId,
        input.competencia
      );
      statementIdsToRefresh.push(...resetStatementIds);
    }

    const imported =
      importFormat === ".csv"
        ? await importInterCsv(db, content, input.cardId, userId, card.name, input.competencia)
        : await importOfx(db, content, input.cardId, userId, card.name, input.competencia);

    statementIdsToRefresh.push(...imported.statementIds);
    await refreshStatementTotals(db, statementIdsToRefresh);

    return imported.count;
  }, { timeout: 60000 });

  return { kind: "ok" as const, count: result };
}
