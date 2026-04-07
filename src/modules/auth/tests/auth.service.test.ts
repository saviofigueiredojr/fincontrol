import { describe, expect, it } from "vitest";
import { extractClientIp } from "../auth.service";

describe("auth.service", () => {
  describe("extractClientIp", () => {
    it("prefers trusted Vercel headers over generic forwarded-for", () => {
      const ip = extractClientIp({
        headers: {
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
          "x-real-ip": "198.51.100.20",
          "x-vercel-forwarded-for": "198.51.100.30",
        },
      });

      expect(ip).toBe("198.51.100.30");
    });

    it("falls back to x-real-ip and x-forwarded-for when needed", () => {
      expect(
        extractClientIp({
          headers: {
            "x-real-ip": "198.51.100.20",
          },
        })
      ).toBe("198.51.100.20");

      expect(
        extractClientIp({
          headers: {
            "x-forwarded-for": "203.0.113.10, 10.0.0.1",
          },
        })
      ).toBe("203.0.113.10");
    });

    it("returns unknown when no usable header exists", () => {
      expect(extractClientIp()).toBe("unknown");
      expect(
        extractClientIp({
          headers: {
            "x-real-ip": "unknown",
          },
        })
      ).toBe("unknown");
    });
  });
});
