import { describe, expect, it } from "vitest";
import { routeWarningText, t } from ".";

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

  it("uses natural Swedish planner and surface wording", () => {
    expect(t("sv", "planLoop")).toBe("Planera en runda");
    expect(t("sv", "unpaved")).toBe("obelagt");
    expect(t("sv", "privacyFirst")).toBe("Integritet först");
  });
});
