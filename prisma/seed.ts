import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.transaction.deleteMany();
  await prisma.cardStatement.deleteMany();
  await prisma.creditCard.deleteMany();
  await prisma.monthClose.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.recurringTemplate.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const savioHash = await bcrypt.hash("Cnn@2003", 10);
  const iagoHash = await bcrypt.hash("Ia080498go#", 10);

  const savio = await prisma.user.create({
    data: {
      name: "Sávio",
      email: "savioff7@gmail.com",
      passwordHash: savioHash,
      role: "admin",
    },
  });

  const namorado = await prisma.user.create({
    data: {
      name: "Iago",
      email: "iagoantunesmosar@hotmail.com",
      passwordHash: iagoHash,
      role: "member",
    },
  });

  // Settings
  await prisma.setting.createMany({
    data: [
      { key: "division_mode", value: "proportional" },
      { key: "savio_income", value: "6871.58" },
      { key: "partner_income", value: "7155.70" },
      { key: "partner_va", value: "682.00" },
    ],
  });

  // Credit Cards
  const cardInter = await prisma.creditCard.create({
    data: { name: "Inter", bank: "Inter", closingDay: 25, dueDay: 2, userId: savio.id },
  });
  await prisma.creditCard.create({
    data: { name: "Caixa", bank: "Caixa", closingDay: 20, dueDay: 1, userId: savio.id },
  });
  await prisma.creditCard.create({
    data: { name: "C6", bank: "C6 Bank", closingDay: 15, dueDay: 22, userId: savio.id },
  });
  await prisma.creditCard.create({
    data: { name: "Nubank", bank: "Nubank", closingDay: 10, dueDay: 17, userId: savio.id },
  });

  // Goal
  await prisma.goal.create({
    data: {
      name: "Reserva de Emergência",
      targetAmount: 45000,
      currentAmount: 0,
      deadline: new Date("2027-03-31"),
    },
  });

  // ===== COMPETÊNCIA 03/2026 - CENÁRIO INDIVIDUAL =====
  const comp0326 = "2026-03";

  // Renda março
  await prisma.transaction.create({
    data: {
      date: new Date("2026-03-05"),
      competencia: comp0326,
      description: "Renda Líquida PJ",
      category: "Salário",
      amount: 6871.58,
      type: "income",
      ownership: "mine",
      source: "manual",
      userId: savio.id,
    },
  });

  // Saldo inicial (caixa)
  await prisma.transaction.create({
    data: {
      date: new Date("2026-03-01"),
      competencia: comp0326,
      description: "Saldo Inicial em Conta",
      category: "Saldo Anterior",
      amount: 3866.57,
      type: "income",
      ownership: "mine",
      source: "manual",
      userId: savio.id,
    },
  });

  // Faturas março
  const faturas0326 = [
    { desc: "Fatura Inter", amount: 3150.94, card: "Inter" },
    { desc: "Fatura Caixa", amount: 3540.68, card: "Caixa" },
    { desc: "Fatura C6", amount: 447.73, card: "C6" },
    { desc: "Fatura Nubank", amount: 257.0, card: "Nubank" },
  ];

  for (const f of faturas0326) {
    await prisma.transaction.create({
      data: {
        date: new Date("2026-03-10"),
        competencia: comp0326,
        description: f.desc,
        category: "Cartão de Crédito",
        amount: f.amount,
        type: "expense",
        ownership: "mine",
        source: "manual",
        userId: savio.id,
      },
    });
  }

  // Custos da casa março
  const custosCasa0326 = [
    { desc: "Aluguel pte 1", amount: 676.42 },
    { desc: "Aluguel pte 2", amount: 268.92 },
    { desc: "Mudança", amount: 300.0 },
    { desc: "Internet", amount: 83.36 },
  ];

  for (const c of custosCasa0326) {
    await prisma.transaction.create({
      data: {
        date: new Date("2026-03-10"),
        competencia: comp0326,
        description: c.desc,
        category: "Moradia",
        amount: c.amount,
        type: "expense",
        ownership: "mine",
        source: "manual",
        userId: savio.id,
      },
    });
  }

  // MonthClose março
  const totalIncome0326 = 6871.58 + 3866.57;
  const totalExpense0326 = 3150.94 + 3540.68 + 447.73 + 257.0 + 676.42 + 268.92 + 300.0 + 83.36;
  await prisma.monthClose.create({
    data: {
      competencia: comp0326,
      openingBalance: 3866.57,
      totalIncome: totalIncome0326,
      totalExpense: totalExpense0326,
      metaAllocation: 0,
      closingBalance: totalIncome0326 - totalExpense0326,
      status: "open",
    },
  });

  // ===== COMPETÊNCIA 04/2026+ - CENÁRIO CONJUNTO =====

  // Recebíveis extraordinários abril
  const recebiveisAbril = [
    { desc: "Repasse namorado (ajuste)", amount: 171.78 },
    { desc: "Venda da Geladeira", amount: 400.0 },
    { desc: "Empréstimo a receber", amount: 100.0 },
  ];

  for (const r of recebiveisAbril) {
    await prisma.transaction.create({
      data: {
        date: new Date("2026-04-05"),
        competencia: "2026-04",
        description: r.desc,
        category: "Receita Extra",
        amount: r.amount,
        type: "income",
        ownership: "mine",
        source: "manual",
        userId: savio.id,
      },
    });
  }

  // Viagem RJ - abril
  await prisma.transaction.create({
    data: {
      date: new Date("2026-04-29"),
      competencia: "2026-04",
      description: "Viagem Rio de Janeiro (29/04 a 05/05)",
      category: "Lazer",
      amount: 1200.0,
      type: "expense",
      ownership: "joint",
      source: "manual",
      userId: savio.id,
    },
  });

  // Repasse namorado maio
  await prisma.transaction.create({
    data: {
      date: new Date("2026-05-05"),
      competencia: "2026-05",
      description: "Repasse namorado (ajuste)",
      category: "Receita Extra",
      amount: 171.78,
      type: "income",
      ownership: "mine",
      source: "manual",
      userId: savio.id,
    },
  });

  // Parcelas Inter (04/2026 a 02/2027)
  const parcelasInter: { comp: string; amount: number }[] = [
    { comp: "2026-04", amount: 1108.43 },
    { comp: "2026-05", amount: 657.9 },
    { comp: "2026-06", amount: 657.9 },
    { comp: "2026-07", amount: 183.86 },
    { comp: "2026-08", amount: 183.86 },
    { comp: "2026-09", amount: 104.83 },
    { comp: "2026-10", amount: 69.83 },
    { comp: "2026-11", amount: 44.83 },
    { comp: "2026-12", amount: 44.83 },
    { comp: "2027-01", amount: 44.83 },
    { comp: "2027-02", amount: 44.83 },
  ];

  for (const p of parcelasInter) {
    const [y, m] = p.comp.split("-").map(Number);
    await prisma.transaction.create({
      data: {
        date: new Date(y, m - 1, 10),
        competencia: p.comp,
        description: "Fatura Inter (parcelas residuais)",
        category: "Cartão de Crédito",
        amount: p.amount,
        type: "expense",
        ownership: "mine",
        source: "manual",
        userId: savio.id,
      },
    });
  }

  // Recurring templates - despesas fixas conjuntas (a partir de 04/2026)
  const despesasFixas = [
    { desc: "Aluguel", category: "Moradia", amount: 3227.09, day: 5 },
    { desc: "Água", category: "Moradia", amount: 180.0, day: 10 },
    { desc: "Luz", category: "Moradia", amount: 320.0, day: 15 },
    { desc: "Internet", category: "Moradia", amount: 100.0, day: 10 },
    { desc: "Dados Móveis", category: "Comunicação", amount: 83.0, day: 10 },
    { desc: "Alimentação/Mercado", category: "Alimentação", amount: 1154.0, day: 1 },
  ];

  for (const d of despesasFixas) {
    await prisma.recurringTemplate.create({
      data: {
        description: d.desc,
        category: d.category,
        amount: d.amount,
        type: "expense",
        ownership: "joint",
        dayOfMonth: d.day,
        startDate: "2026-04",
        isActive: true,
      },
    });
  }

  // Recurring templates - rendas
  await prisma.recurringTemplate.create({
    data: {
      description: "Renda Líquida PJ - Sávio",
      category: "Salário",
      amount: 6871.58,
      type: "income",
      ownership: "mine",
      dayOfMonth: 5,
      startDate: "2026-04",
      isActive: true,
    },
  });

  await prisma.recurringTemplate.create({
    data: {
      description: "Renda Líquida CLT - Namorado",
      category: "Salário",
      amount: 7155.7,
      type: "income",
      ownership: "partner",
      dayOfMonth: 5,
      startDate: "2026-04",
      isActive: true,
    },
  });

  await prisma.recurringTemplate.create({
    data: {
      description: "Vale Alimentação - Namorado",
      category: "Benefício",
      amount: 682.0,
      type: "income",
      ownership: "partner",
      dayOfMonth: 5,
      startDate: "2026-04",
      isActive: true,
    },
  });

  // Generate recurring transactions for 04/2026 to 03/2027
  const templates = await prisma.recurringTemplate.findMany({ where: { isActive: true } });

  for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
    const baseDate = new Date(2026, 3 + monthOffset, 1); // starts at April 2026
    const comp = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}`;

    for (const tmpl of templates) {
      if (comp < tmpl.startDate) continue;
      if (tmpl.endDate && comp > tmpl.endDate) continue;

      await prisma.transaction.create({
        data: {
          date: new Date(baseDate.getFullYear(), baseDate.getMonth(), tmpl.dayOfMonth),
          competencia: comp,
          description: tmpl.description,
          category: tmpl.category,
          amount: tmpl.amount,
          type: tmpl.type,
          ownership: tmpl.ownership,
          isRecurring: true,
          recurringId: tmpl.id,
          source: "recurring",
          userId: tmpl.ownership === "partner" ? namorado.id : savio.id,
        },
      });
    }
  }

  console.log("✅ Seed completed successfully!");
  console.log(`   Sávio: savioff7@gmail.com`);
  console.log(`   Iago: iagoantunesmosar@hotmail.com`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
