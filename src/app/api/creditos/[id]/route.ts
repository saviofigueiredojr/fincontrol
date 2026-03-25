import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getHouseholdForUser } from "@/lib/household";

export const dynamic = "force-dynamic";

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { memberIds } = await getHouseholdForUser(userId);
        const body = await request.json();
        const { status } = body;

        if (!status || !["unissued", "issued", "pending", "paid"].includes(status)) {
            return NextResponse.json({ error: "Status inválido" }, { status: 400 });
        }

        const existing = await prisma.pjReceipt.findUnique({
            where: { id: params.id },
            include: { transaction: true }
        });

        if (!existing || !memberIds.includes(existing.userId)) {
            return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
        }

        let transactionId = existing.transactionId;

        // Se estiver mudando para pago e ainda não tem transação atrelada
        if (status === "paid" && existing.status !== "paid" && !existing.transactionId) {
            const transaction = await prisma.transaction.create({
                data: {
                    date: new Date(), // Usa a data da conciliação (hoje)
                    competencia: existing.competencia,
                    description: existing.clientName,
                    category: "Crédito PJ",
                    amount: existing.amount,
                    type: "income",
                    ownership: "mine",
                    source: "credito_pj",
                    userId: existing.userId,
                }
            });
            transactionId = transaction.id;
        }

        const updated = await prisma.pjReceipt.update({
            where: { id: params.id },
            data: {
                status,
                ...(transactionId && { transactionId })
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Update credito error:", error);
        return NextResponse.json(
            { error: "Erro interno do servidor" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const userId = (session.user as { id: string }).id;
        const { memberIds } = await getHouseholdForUser(userId);

        const existing = await prisma.pjReceipt.findUnique({
            where: { id: params.id }
        });

        if (!existing || !memberIds.includes(existing.userId)) {
            return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
        }

        if (existing.transactionId) {
            await prisma.transaction.delete({ where: { id: existing.transactionId } });
        }

        await prisma.pjReceipt.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete credito error:", error);
        return NextResponse.json(
            { error: "Erro interno do servidor" },
            { status: 500 }
        );
    }
}
