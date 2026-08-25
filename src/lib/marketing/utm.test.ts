import { describe, expect, it } from "vitest";
import { lerUtm } from "./utm";

describe("lerUtm", () => {
  it("normaliza os cinco campos e ausente sempre vira string vazia", () => {
    expect(lerUtm({ utm_source: "Instagram", utm_medium: "SOCIAL" })).toEqual({ utm_source: "instagram", utm_medium: "social", utm_campaign: "", utm_content: "", utm_term: "" });
  });
  it("corta, remove controles e usa o primeiro valor repetido", () => {
    const utm = lerUtm({ utm_source: ["Primeiro\n\r\0\u0085", "segundo"], utm_campaign: "A".repeat(5_000) });
    expect(utm.utm_source).toBe("primeiro");
    expect(utm.utm_campaign).toHaveLength(120);
  });
});
