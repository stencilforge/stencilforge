import { describe, expect, it } from "vitest";
import { parseLength } from "./utils";

describe("parseLength", () => {
  it("parses plain numbers in the default unit", () => {
    expect(parseLength("12")).toBe(12);
    expect(parseLength("2", "in")).toBeCloseTo(50.8);
  });
  it("understands unit suffixes", () => {
    expect(parseLength("1in")).toBeCloseTo(25.4);
    expect(parseLength("3cm")).toBe(30);
    expect(parseLength('2"')).toBeCloseTo(50.8);
  });
  it("evaluates arithmetic", () => {
    expect(parseLength("10+5")).toBe(15);
    expect(parseLength("(2+3)*4")).toBe(20);
    expect(parseLength("1in+5mm")).toBeCloseTo(30.4);
    expect(parseLength("10/4")).toBe(2.5);
  });
  it("rejects garbage", () => {
    expect(parseLength("abc")).toBeNull();
    expect(parseLength("")).toBeNull();
    expect(parseLength("1+")).toBeNull();
  });
});
