import { describe, it, expect } from "vitest";
import { PjAutomationService } from "../pj-automation.service";

describe("PjAutomationService", () => {
    describe("calculateTaxProvision", () => {
        it("should correctly calculate Simples plus INSS over pro-labore", () => {
            expect(PjAutomationService.calculateTaxProvision(1000, 6.0)).toBe(90.8);
            expect(PjAutomationService.calculateTaxProvision(1500, 10.5)).toBe(203.7);
        });

        it("should return 0 if tax rate is missing or zero", () => {
            expect(PjAutomationService.calculateTaxProvision(1000, 0)).toBe(0);
            expect(PjAutomationService.calculateTaxProvision(1000, null)).toBe(0);
            expect(PjAutomationService.calculateTaxProvision(1000, undefined)).toBe(0);
        });
    });

    describe("getReceiptsToGenerate", () => {
        const sampleRetainer = {
            id: "rtn_1",
            householdId: "hh_1",
            clientName: "Tech Corp",
            description: "Consultoria Dev",
            amount: 5000,
            dueDay: 5,
            active: true,
        };

        it("should generate a receipt if the current day >= dueDay and it has not been generated for the target month", () => {
            const result = PjAutomationService.getReceiptsToGenerate(
                [sampleRetainer],
                [],
                "2026-03",
                "2026-03-05" // The exact due day
            );

            expect(result).toHaveLength(1);
            expect(result[0].clientName).toBe("Tech Corp");
            expect(result[0].amount).toBe(5000);
            expect(result[0].status).toBe("unissued");
            expect(result[0].competencia).toBe("2026-03");
            expect(result[0].dueDate?.getDate()).toBe(5);
        });

        it("should not generate a receipt if the current day is before the dueDay", () => {
            const result = PjAutomationService.getReceiptsToGenerate(
                [sampleRetainer],
                [],
                "2026-03",
                "2026-03-04" // Before due day
            );

            expect(result).toHaveLength(0);
        });

        it("should not generate a receipt if it has already been generated for that month", () => {
            const result = PjAutomationService.getReceiptsToGenerate(
                [sampleRetainer],
                [{ retainerId: "rtn_1", competencia: "2026-03" }],
                "2026-03",
                "2026-03-10"
            );

            expect(result).toHaveLength(0);
        });

        it("should implicitly ignore inactive retainers", () => {
            const inactiveRetainer = { ...sampleRetainer, active: false };
            const result = PjAutomationService.getReceiptsToGenerate(
                [inactiveRetainer],
                [],
                "2026-03",
                "2026-03-10"
            );

            expect(result).toHaveLength(0);
        });
    });
});
