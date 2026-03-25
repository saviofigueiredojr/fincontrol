import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ImportTransactionsInput, supportedImportFormats } from "./import.schemas";
import { FallbackCategorizerService } from "./fallback-categorizer.service";
import { AiCategorizerService } from "./ai-categorizer.service";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

const VALID_CATEGORIES = [
  "Alimentação", "Transporte", "Assinaturas", "Moradia", "Saúde",
  "Educação", "Lazer", "Compras", "Serviços", "Transferência / Pagamento",
  "Impostos PJ", "Crédito PJ", "Receita", "Outros"
];

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
    select: { id: true },
  });

  const parentIds = parentTransactions.map((transaction) => transaction.id);

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

async function importInterCsv(
  db: DatabaseClient,
  content: string,
  cardId: string,
  userId: string
) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { count: 0, statementIds: [] as string[] };
  }

  const dataLines = lines.slice(1);

  // 1. Pass: Collect all valid parsed rows
  const parsedRows = [];
  for (const line of dataLines) {
    const columns = parseCSVLine(line);
    if (columns.length < 5) continue;

    const [dateValue, description, category, tipo, amountValue] = columns;
    const amount = parseBRLCurrency(amountValue);
    if (amount < 0) continue;

    const date = parseBRDate(dateValue);
    if (Number.isNaN(date.getTime())) continue;

    const competencia = competenciaFromDate(date);
    const installment = parseInstallment(tipo);

    parsedRows.push({
      date,
      description: description.trim(),
      rawCategory: category.trim(),
      amount,
      competencia,
      installment,
      tipo
    });
  }

  // 2. Pass: AI Classification batching
  const unknowns = parsedRows
    .map(r => ({ desc: r.description, fallback: FallbackCategorizerService.categorize(r.description, r.rawCategory) }))
    .filter(r => !r.fallback)
    .map(r => r.desc);

  const aiMap = unknowns.length > 0
    ? await AiCategorizerService.categorizeBatch(unknowns, VALID_CATEGORIES)
    : {};

  // 3. Pass: Database Insertion
  const statementIds: string[] = [];
  let count = 0;

  for (const row of parsedRows) {
    let finalCategory = FallbackCategorizerService.categorize(row.description, row.rawCategory);
    if (!finalCategory) {
      finalCategory = aiMap[row.description] || row.rawCategory || "Outros";
    }

    const statement = await getOrCreateStatement(db, cardId, row.competencia);
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

    if (row.installment && row.installment.current === 1 && row.installment.total > 1) {
      for (
        let installmentIndex = 2;
        installmentIndex <= row.installment.total;
        installmentIndex += 1
      ) {
        const futureDate = new Date(row.date);
        futureDate.setMonth(futureDate.getMonth() + (installmentIndex - 1));

        const futureCompetencia = competenciaFromDate(futureDate);
        const futureStatement = await getOrCreateStatement(
          db,
          cardId,
          futureCompetencia
        );

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
  userId: string
) {
  const transactionRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  const parsedRows = [];

  // 1. Pass: Collect
  while ((match = transactionRegex.exec(content)) !== null) {
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
      date,
      description: description.trim(),
      amount: Math.abs(parsedAmount),
      rawAmount: parsedAmount,
      competencia: competenciaFromDate(date),
    });
  }

  // 2. Pass: Categorize
  const unknowns = parsedRows
    .map(r => ({ desc: r.description, fallback: FallbackCategorizerService.categorize(r.description) }))
    .filter(r => !r.fallback)
    .map(r => r.desc);

  const aiMap = unknowns.length > 0
    ? await AiCategorizerService.categorizeBatch(unknowns, VALID_CATEGORIES)
    : {};

  // 3. Pass: Insert
  const statementIds: string[] = [];
  let count = 0;

  for (const row of parsedRows) {
    let finalCategory = FallbackCategorizerService.categorize(row.description);
    if (!finalCategory) {
      finalCategory = aiMap[row.description] || "Outros";
    }

    const statement = await getOrCreateStatement(db, cardId, row.competencia);
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
    select: { id: true },
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
        ? await importInterCsv(db, content, input.cardId, userId)
        : await importOfx(db, content, input.cardId, userId);

    statementIdsToRefresh.push(...imported.statementIds);
    await refreshStatementTotals(db, statementIdsToRefresh);

    return imported.count;
  }, { timeout: 25000 }); // Provide extra timeout to allow external LLM calls to complete reliably

  return { kind: "ok" as const, count: result };
}
