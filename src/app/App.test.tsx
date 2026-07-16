import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("../components/map/MapView", () => ({
  MapView: ({ onStartChange }: { onStartChange: (point: [number, number]) => void }) => (
    <button data-testid="mock-map" onClick={() => onStartChange([18.1, 59.3])}>
      Map
    </button>
  ),
}));

const routeResponse = (offset = 0) => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [18.0686, 59.3293],
          [18.08 + offset, 59.34],
          [18.09 + offset, 59.325],
          [18.075, 59.315 - offset],
          [18.0686, 59.3293],
        ],
      },
      properties: {
        summary: { distance: 5000 + offset * 1000, ascent: 42 },
        segments: [{ steps: [{ instruction: "Head north", distance: 300, type: 11 }] }],
      },
    },
  ],
});

describe("LoopRoute application", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-GB" });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { longitude: 18.0686, latitude: 59.3293, accuracy: 8 },
          } as GeolocationPosition),
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    });
  });

  it("selects presets and validates custom distance", async () => {
    render(<App />);
    await screen.findByText("Distance");
    await userEvent.click(screen.getByRole("button", { name: "10 km" }));
    expect(screen.getByRole("button", { name: /Find my loops/ })).toHaveTextContent("10 km");
    const custom = screen.getByRole("spinbutton");
    fireEvent.change(custom, { target: { value: "101" } });
    expect(screen.getByRole("button", { name: /Find my loops/ })).toBeDisabled();
  });

  it("keeps search and map start selection available when location is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: 1 } as GeolocationPositionError),
      },
    });
    render(<App />);
    expect(await screen.findByText(/Location access was unavailable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set start on map" }));
    await userEvent.click(screen.getByTestId("mock-map"));
    expect(screen.getByRole("button", { name: /Find my loops/ })).toBeEnabled();
  });

  it("shows successful and partial candidate results without crashing", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        return new Response(
          JSON.stringify(call <= 2 ? routeResponse(call * 0.03) : { error: "No route" }),
          { status: call <= 2 ? 200 : 404, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Find my loops/ }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Route [A-C]/ }).length).toBeGreaterThanOrEqual(
        1,
      ),
    );
    expect(screen.getByText(/fewer than three distinct routes/i)).toBeInTheDocument();
  });

  it("switches language and units through accessible settings", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0], "sv");
    expect(screen.getByRole("heading", { name: "Inställningar" })).toBeInTheDocument();
    await userEvent.selectOptions(selects[1], "mi");
    expect(selects[1]).toHaveValue("mi");
  });

  it("announces offline state and disables generation", async () => {
    render(<App />);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new Event("offline"));
    expect(await screen.findByText(/Saved routes remain available/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Find my loops/ })).toBeDisabled();
  });
});
