import { describe, expect, it } from "vitest";
import { parseCSVLine } from "@/modules/import/import.service";

describe("parseCSVLine", () => {
  it("parses the malformed Inter CSV variant with doubled quotes", () => {
    const line = '"06/04/2026,""AMAZON BR"",""LIVRARIAS"",""Parcela 1/5"",""R$ 218,40"""';

    expect(parseCSVLine(line)).toEqual([
      "06/04/2026",
      "AMAZON BR",
      "LIVRARIAS",
      "Parcela 1/5",
      "R$ 218,40",
    ]);
  });

  it("keeps parsing regular CSV lines", () => {
    const line = '"06/04/2026","AMAZON BR","LIVRARIAS","Parcela 1/5","R$ 218,40"';

    expect(parseCSVLine(line)).toEqual([
      "06/04/2026",
      "AMAZON BR",
      "LIVRARIAS",
      "Parcela 1/5",
      "R$ 218,40",
    ]);
  });
});
