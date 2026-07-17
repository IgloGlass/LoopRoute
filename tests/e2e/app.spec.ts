import { expect, test, type Page } from "@playwright/test";

const makeRoute = (seed: number, variant = 0) => {
  const lon = 18.0686;
  const lat = 59.3293;
  const spread = 0.012 + variant * 0.004;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [lon, lat],
            [lon + spread, lat + spread * 0.7],
            [lon + spread * 1.4, lat - spread * 0.4],
            [lon - spread * 0.3, lat - spread],
            [lon, lat],
          ],
        },
        properties: {
          summary: { distance: 5000 + variant * 55, ascent: 38 + variant * 7, descent: 37 },
          segments: [
            {
              steps: [
                { instruction: "Head north on the path", distance: 320, type: 11 },
                { instruction: "Turn right", distance: 850, type: 1 },
              ],
            },
          ],
          extras: {
            surface: {
              values: [
                [0, 3500, 1],
                [3500, 5000, 6],
              ],
            },
          },
        },
      },
    ],
  };
};

async function mockProviders(page: Page) {
  let routeCalls = 0;
  await page.route("https://tiles.openfreemap.org/**", async (route) => {
    if (route.request().url().includes("/styles/"))
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
      });
    else await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/route", async (route) => {
    routeCalls += 1;
    const body = route.request().postDataJSON() as { seed: number };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(makeRoute(body.seed, (routeCalls - 1) % 4)),
    });
  });
  await page.route("**/api/geocode?**", async (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: "stockholm",
            label: "Stockholm, Sweden",
            locality: "Stockholm",
            country: "Sweden",
            latitude: 59.3293,
            longitude: 18.0686,
          },
        ],
      }),
    }),
  );
  return { calls: () => routeCalls };
}

test.beforeEach(async ({ page }) => {
  await mockProviders(page);
});

test("GPS success generates three routes, selects one and exports GPX", async ({ page }) => {
  await page.goto("/");
  const generateButton = page.getByRole("button", { name: /Find my loops/ });
  await expect(generateButton).toBeEnabled();
  await generateButton.click();
  await expect(page.getByRole("radio", { name: /Route A/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Route C/ })).toBeVisible();
  await page.getByRole("radio", { name: /Route B/ }).click();
  await expect(page.getByText("Selected route")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export GPX" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/looproute-.*\.gpx/);
});

test("GPS denial falls back to explicit address search", async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await mockProviders(page);
  await page.goto("/");
  await expect(page.getByText(/Location access was unavailable/)).toBeVisible();
  await page.getByPlaceholder("Search town, park or address").fill("Stockholm");
  await expect(page.getByRole("option", { name: /Stockholm, Sweden/ })).toBeVisible();
  await page.getByPlaceholder("Search town, park or address").press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(page.getByRole("button", { name: /Find my loops/ })).toBeEnabled();
  await context.close();
});

test("dialogs trap focus, close with Escape, and restore their trigger", async ({ page }) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Settings" });
  await settings.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(settings).toBeFocused();
});

test("map start selection and privacy-preserving shared link work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Set start on map" }).click();
  const viewport = page.viewportSize()!;
  await page.mouse.click(viewport.width * 0.78, Math.min(180, viewport.height * 0.2));
  await expect(page.getByRole("button", { name: /Find my loops/ })).toBeEnabled();
  await page.getByRole("button", { name: /Find my loops/ }).click();
  await page.getByRole("button", { name: "Share route" }).click();
  await expect(page.getByText("Share a privacy-rounded start")).toBeVisible();
  await page.getByRole("button", { name: "Copy planning link" }).click();
  await expect(page.getByRole("button", { name: "Planning link copied" })).toBeVisible();
});

test("shared route parameters and one-call generate another flow", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/route")) calls += 1;
  });
  await page.goto("/?lat=59.329&lng=18.069&distance=7500&mode=trail&steps=1&seed=12345&units=km");
  await expect(page.getByText(/shared route plan was opened/i)).toBeVisible();
  await page.getByRole("button", { name: "Regenerate shared route" }).click();
  await expect(page.getByRole("radio", { name: /Route A/ })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Generate another" }).click();
  await expect.poll(() => calls).toBe(2);
});

test("route priorities and shape-neutral portfolio reach the same-origin route API", async ({
  page,
}) => {
  const requests: Array<{
    priorities: Record<string, boolean>;
    roundTripPoints: number;
  }> = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/route")) requests.push(request.postDataJSON());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Near water" }).click();
  await page.getByRole("button", { name: "Unpaved" }).click();
  await page.getByRole("button", { name: /Find my loops/ }).click();
  await expect(page.getByRole("radio", { name: /Route C/ })).toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(3);
  expect(requests.length).toBeLessThanOrEqual(5);
  expect(requests.slice(0, 3).map((request) => request.roundTripPoints)).toEqual([2, 3, 4]);
  expect(requests.every((request) => request.priorities.water)).toBe(true);
  expect(requests.every((request) => request.priorities.unpaved)).toBe(true);
});

test("mobile layout has no horizontal overflow and supports live follow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only layout assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /Find my loops/ }).click();
  await page.getByRole("button", { name: "Start following" }).click();
  await expect(page.getByText("Following Route")).toBeVisible();
  await expect(page.getByText("Distance to route")).toBeVisible();
  const followSheetHeight = await page
    .locator(".bottom-sheet")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(followSheetHeight).toBeLessThanOrEqual(page.viewportSize()!.height * 0.45);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Stop following" }).click();
  await expect(page.getByText("Selected route")).toBeVisible();
});

test("mobile sheet drag reliably reveals the map and keeps large touch targets", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only gesture assertion");
  await page.goto("/");
  const handle = page.locator(".sheet-handle");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 100, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".sheet-scroll")).toHaveAttribute("aria-hidden", "true");
  const targets = await page
    .locator(".sheet-handle, .topbar .icon-button")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
  expect(targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});

test("desktop route options remain fully visible without a horizontal carousel", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop-only layout assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /Find my loops/ }).click();
  await expect(page.getByRole("radio", { name: /Route C/ })).toBeVisible();
  const routeList = await page.locator(".route-list").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  expect(routeList.display).toBe("grid");
  expect(routeList.scrollWidth).toBeLessThanOrEqual(routeList.clientWidth);
});

test("cleared results can be restored from the undo toast", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Find my loops/ }).click();
  await expect(page.getByRole("radio", { name: /Route A/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear route" }).click();
  await expect(page.getByText("Route cleared")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("radio", { name: /Route A/ })).toBeVisible();
});

test("offline mode clearly disables route generation", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByTestId("map")).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText("Offline").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Find my loops/ })).toBeDisabled();
  await context.setOffline(false);
});
