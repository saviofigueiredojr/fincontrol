import { describe, it, expect } from "vitest";
import { ReserveBenchmarkService } from "../reserve-benchmark.service";

describe("ReserveBenchmarkService", () => {
    it("should calculate correct lifespan based on average runtime expenses", () => {
        // 6 months of expenses summing to 30,000 (avg 5,000/month). Reserve is 15,000 -> 3 months.
        expect(ReserveBenchmarkService.calculateLifespan(15000, [5000, 5000, 4000, 6000, 4000, 6000])).toBe(3.0);
    });

    it("should return 0 if reserve is 0", () => {
        expect(ReserveBenchmarkService.calculateLifespan(0, [5000, 5000])).toBe(0);
        expect(ReserveBenchmarkService.calculateLifespan(-100, [5000, 5000])).toBe(0);
    });

    it("should return 999 (infinity) if expenses are 0", () => {
        expect(ReserveBenchmarkService.calculateLifespan(10000, [0, 0])).toBe(999);
    });

    it("should return 0 if no expense data is provided", () => {
        expect(ReserveBenchmarkService.calculateLifespan(10000, [])).toBe(0);
    });
});
