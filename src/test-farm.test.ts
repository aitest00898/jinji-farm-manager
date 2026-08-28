import { describe, expect, it } from "vitest";
import { parseCommand } from "./core";
import { FarmResolver } from "./farm-resolver";

const farms = [
  { id: "farm-hongxiumei", name: "洪秀美場", active: 1, environment: "production" as const },
  { id: "farm-test", name: "金雞測試場", active: 1, environment: "test" as const },
];

describe("Test/Sandbox Farm safety contract", () => {
  it("resolves a canonical test farm for operational use", () => {
    const resolver = new FarmResolver(farms);
    const result = resolver.resolve("金雞測試場");
    expect(result.kind).toBe("direct");
    expect(result.farm?.environment).toBe("test");
  });

  it("keeps a test-farm typo as a candidate instead of selecting it", () => {
    const resolver = new FarmResolver(farms);
    const result = resolver.resolve("金雞測市場");
    expect(result.kind).toBe("candidates");
    expect(result.candidates[0].farmName).toBe("金雞測試場");
    expect(result.candidates[0].environment).toBe("test");
  });

  it("includes active test farms in operational candidates", () => {
    const resolver = new FarmResolver(farms);
    expect(resolver.allCandidates().map((farm) => farm.farmName)).toEqual(["洪秀美場", "金雞測試場"]);
  });

  it("keeps management commands outside the AI command path", () => {
    expect(parseCommand("新增測試場 金雞測試場").kind).toBe("create_test_farm");
    expect(parseCommand("封存測試場 金雞測試場").kind).toBe("archive_test_farm");
  });
});
