import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

function parseBRLCurrency(value: string): number {
  // Handle "R$ 32,89", "-R$ 4.988,09", "R$ -32,89"
  const cleaned = value
    .replace(/R\$\s*/g, "")
    .trim();
  const isNegative = cleaned.startsWith("-");
  const abs = cleaned
    .replace("-", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(abs);
  return isNegative ? -num : num;
}

function parseBRDate(dateStr: string): Date {
  // DD/MM/YYYY -> Date
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function parseInstallment(tipo: string): { current: number; total: number } | null {
  const match = tipo.match(/Parcela\s+(\d+)\/(\d+)/i);
  if (match) {
    return { current: parseInt(match[1]), total: parseInt(match[2]) };
  }
  return null;
}

function competenciaFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function parseCSVInter(
  content: string,
  cardId: string,
  userId: string
): Promise<number> {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return 0;

  // Remove header
  const dataLines = lines.slice(1);
  let imported = 0;

  for (const line of dataLines) {
    // Parse CSV respecting quotes
    const columns = parseCSVLine(line);
    if (columns.length < 5) continue;

    const [dateStr, descricao, categoria, tipo, valorStr] = columns;

    const amount = parseBRLCurrency(valorStr);

    // Skip negative values (payments)
    if (amount < 0) continue;

    const date = parseBRDate(dateStr);
    if (isNaN(date.getTime())) continue;

    const competencia = competenciaFromDate(date);

    // Check for installments
    const installment = parseInstallment(tipo);

    // Find or create statement for this card and competencia
    const statement = await getOrCreateStatement(cardId, competencia);

    const mainTx = await prisma.transaction.create({
      data: {
        date,
        competencia,
        description: descricao.trim(),
        category: categoria.trim() || "Outros",
        amount,
        type: "expense",
        ownership: "mine",
        installmentCurrent: installment?.current || null,
        installmentTotal: installment?.total || null,
        source: "csv_inter",
        cardStatementId: statement.id,
        userId,
      },
    });
    imported++;

    // Generate future installments if this is the first installment
    if (installment && installment.current === 1 && installment.total > 1) {
      for (let i = 2; i <= installment.total; i++) {
        const futureDate = new Date(date);
        futureDate.setMonth(futureDate.getMonth() + (i - 1));
        const futureComp = competenciaFromDate(futureDate);
        const futureStatement = await getOrCreateStatement(cardId, futureComp);

        await prisma.transaction.create({
          data: {
            date: futureDate,
            competencia: futureComp,
            description: `${descricao.trim()} (${i}/${installment.total})`,
            category: categoria.trim() || "Outros",
            amount,
            type: "expense",
            ownership: "mine",
            installmentCurrent: i,
            installmentTotal: installment.total,
            parentId: mainTx.id,
            source: "csv_inter",
            cardStatementId: futureStatement.id,
            userId,
          },
        });
        imported++;
      }
    }
  }

  return imported;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.replace(/^"|"$/g, "").trim());
}

async function parseOFX(
  content: string,
  cardId: string,
  userId: string
): Promise<number> {
  let imported = 0;

  // Simple OFX parser - extract STMTTRN blocks
  const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = txRegex.exec(content)) !== null) {
    const block = match[1];

    const dtPosted = extractOFXField(block, "DTPOSTED");
    const trnAmt = extractOFXField(block, "TRNAMT");
    const name = extractOFXField(block, "NAME") || extractOFXField(block, "MEMO") || "Importado OFX";

    if (!dtPosted || !trnAmt) continue;

    // Parse DTPOSTED (YYYYMMDD or YYYYMMDDHHMMSS)
    const year = parseInt(dtPosted.substring(0, 4));
    const month = parseInt(dtPosted.substring(4, 6));
    const day = parseInt(dtPosted.substring(6, 8));
    const date = new Date(year, month - 1, day);

    if (isNaN(date.getTime())) continue;

    const rawAmount = parseFloat(trnAmt);
    const amount = Math.abs(rawAmount);
    const type = rawAmount >= 0 ? "income" : "expense";

    const competencia = competenciaFromDate(date);
    const statement = await getOrCreateStatement(cardId, competencia);

    await prisma.transaction.create({
      data: {
        date,
        competencia,
        description: name.trim(),
        category: "Importado",
        amount,
        type,
        ownership: "mine",
        source: "ofx",
        cardStatementId: statement.id,
        userId,
      },
    });
    imported++;
  }

  return imported;
}

function extractOFXField(block: string, field: string): string | null {
  // OFX can be either XML-like (<FIELD>value</FIELD>) or SGML-like (<FIELD>value\n)
  const xmlRegex = new RegExp(`<${field}>([^<]*)</${field}>`, "i");
  const xmlMatch = block.match(xmlRegex);
  if (xmlMatch) return xmlMatch[1].trim();

  const sgmlRegex = new RegExp(`<${field}>(.+)`, "i");
  const sgmlMatch = block.match(sgmlRegex);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return null;
}

async function getOrCreateStatement(cardId: string, competencia: string) {
  const existing = await prisma.cardStatement.findUnique({
    where: { cardId_competencia: { cardId, competencia } },
  });

  if (existing) return existing;

  return prisma.cardStatement.create({
    data: {
      cardId,
      competencia,
      totalAmount: 0,
      status: "open",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const cardId = formData.get("cardId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 });
    }

    if (!cardId) {
      return NextResponse.json({ error: "cardId é obrigatório" }, { status: 400 });
    }

    // Verify card belongs to user
    const card = await prisma.creditCard.findFirst({
      where: { id: cardId, userId },
    });

    if (!card) {
      return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
    }

    const content = await file.text();
    const fileName = file.name.toLowerCase();
    const competencia = formData.get("competencia") as string | null;

    // If competencia is provided, remove existing imported transactions for this card/competencia
    // This prevents duplicates when re-importing the same month
    if (competencia) {
      // Find the statement for this card/competencia
      const existingStatement = await prisma.cardStatement.findUnique({
        where: { cardId_competencia: { cardId, competencia } },
      });
      if (existingStatement) {
        // Delete child installments (future parcelas) of transactions in this statement
        const parentTxs = await prisma.transaction.findMany({
          where: { cardStatementId: existingStatement.id },
          select: { id: true },
        });
        const parentIds = parentTxs.map((t) => t.id);
        if (parentIds.length > 0) {
          await prisma.transaction.deleteMany({
            where: { parentId: { in: parentIds } },
          });
        }
        // Delete the transactions themselves
        await prisma.transaction.deleteMany({
          where: { cardStatementId: existingStatement.id },
        });
        // Reset statement total
        await prisma.cardStatement.update({
          where: { id: existingStatement.id },
          data: { totalAmount: 0 },
        });
      }
    }

    let importedCount = 0;

    if (fileName.endsWith(".csv")) {
      importedCount = await parseCSVInter(content, cardId, userId);
    } else if (fileName.endsWith(".ofx")) {
      importedCount = await parseOFX(content, cardId, userId);
    } else {
      return NextResponse.json(
        { error: "Formato não suportado. Use CSV ou OFX." },
        { status: 400 }
      );
    }

    // Update statement totals
    const statements = await prisma.cardStatement.findMany({
      where: { cardId },
      include: { transactions: { select: { amount: true } } },
    });

    for (const stmt of statements) {
      const total = stmt.transactions.reduce((s, t) => s + t.amount, 0);
      await prisma.cardStatement.update({
        where: { id: stmt.id },
        data: { totalAmount: total },
      });
    }

    return NextResponse.json({
      message: `${importedCount} transações importadas com sucesso`,
      count: importedCount,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Erro ao importar arquivo" },
      { status: 500 }
    );
  }
}
