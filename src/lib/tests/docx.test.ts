import { describe, expect, it } from "vitest";
import { createPlanningDocx } from "@/lib/docx";

describe("createPlanningDocx", () => {
  it("creates a readable docx package with escaped planning content", () => {
    const docx = createPlanningDocx({
      title: "Planejamento & Casa",
      content: "# Plano\n\n- Mesa & cadeiras\n- Reserva <45k>",
    });
    const text = docx.toString("utf8");

    expect(docx.readUInt32LE(0)).toBe(0x04034b50);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("word/document.xml");
    expect(text).toContain("Mesa &amp; cadeiras");
    expect(text).toContain("Reserva &lt;45k&gt;");
  });
});
