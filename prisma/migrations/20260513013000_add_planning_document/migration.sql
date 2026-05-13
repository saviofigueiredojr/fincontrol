CREATE TABLE "PlanningDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Planejamento financeiro',
    "content" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanningDocument_householdId_key" ON "PlanningDocument"("householdId");

ALTER TABLE "PlanningDocument" ADD CONSTRAINT "PlanningDocument_householdId_fkey"
FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
