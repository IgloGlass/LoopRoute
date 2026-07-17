import { describe, expect, it } from "vitest";
import { routeWarningText } from ".";

describe("route warning translations", () => {
  it("localizes stable warning codes", () => {
    expect(routeWarningText("sv", "distanceTolerance")).toBe(
      "Distansen avviker mer än 5 % från målet.",
    );
  });

  it("localizes warnings stored by older app versions", () => {
    expect(routeWarningText("sv", "Distance is outside the 5% target tolerance.")).toBe(
      "Distansen avviker mer än 5 % från målet.",
    );
  });
});
