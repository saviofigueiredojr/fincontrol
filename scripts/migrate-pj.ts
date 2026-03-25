import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando migração de Créditos PJ legados...");

    const oldCreditos = await prisma.transaction.findMany({
        where: { category: "Crédito PJ", source: "credito_pj" }
    });

    if (oldCreditos.length === 0) {
        console.log("Nenhum crédito legado encontrado. Nada a fazer.");
        return;
    }

    let migrated = 0;
    for (const tx of oldCreditos) {
        // Check if it already has a receipt
        const existing = await prisma.pjReceipt.findFirst({ where: { transactionId: tx.id } });
        if (existing) continue;

        // Get household context
        const user = await prisma.user.findUnique({ where: { id: tx.userId } });
        if (!user) continue;

        // Get status setting
        const settingKey = `credito_status_${tx.id}`;
        const setting = await prisma.setting.findUnique({
            where: { householdId_key: { householdId: user.householdId, key: settingKey } }
        });

        let status = setting?.value || "pending";
        // Mapeamento antigo para novo
        if (status === "future") status = "unissued"; // Future agora é Falta Emitir
        if (status === "received") status = "paid"; // Received agora é Pago

        await prisma.pjReceipt.create({
            data: {
                clientName: tx.description,
                description: "Migrado automaticamente",
                amount: tx.amount,
                dueDate: tx.date,
                status: status,
                competencia: tx.competencia,
                userId: tx.userId,
                householdId: user.householdId,
                // Se era 'paid' (received), mantemos a transação vinculada. Se não, talvez possamos apagar a transação depois, 
                // mas o script só vai criar o recibo e vincular pela segurança dos dados.
                transactionId: status === "paid" ? tx.id : null,
            }
        });

        // Se o status NÃO for pago, a transação velha está sujando o dashboard. 
        // Nós a apagamos para limpar o dashboard, pois o kanban viverá só na tabela PjReceipt.
        if (status !== "paid") {
            await prisma.transaction.delete({ where: { id: tx.id } });
        }

        migrated++;
    }

    console.log(`Migração concluída! ${migrated} registros processados.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
