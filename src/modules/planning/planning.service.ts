import { prisma } from "@/lib/prisma";
import type { UpdatePlanningDocumentInput } from "./planning.schemas";

const DEFAULT_PLANNING_CONTENT = `# Planejamento financeiro

## Contexto
- Registre aqui a leitura atual do orçamento, metas e decisões importantes.
- Use este espaço como um rascunho vivo: bom o bastante para humanos e simples o bastante para agents consultarem no banco.

## Decisões em aberto
- Quais compras entram agora?
- Quais despesas devem ser provisionadas?
- O que precisa ser revisado antes do próximo fechamento?

## Próximos passos
- Atualizar projeções.
- Revisar prioridades.
- Transformar decisões aprovadas em lançamentos ou metas.`;

export async function getPlanningDocument(householdId: string) {
  return prisma.planningDocument.upsert({
    where: { householdId },
    create: {
      householdId,
      title: "Planejamento financeiro",
      content: DEFAULT_PLANNING_CONTENT,
    },
    update: {},
  });
}

export async function updatePlanningDocument(
  householdId: string,
  input: UpdatePlanningDocumentInput
) {
  return prisma.planningDocument.upsert({
    where: { householdId },
    create: {
      householdId,
      title: input.title,
      content: input.content,
    },
    update: {
      title: input.title,
      content: input.content,
    },
  });
}
