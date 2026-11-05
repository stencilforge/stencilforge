import { test, expect } from "@playwright/test";
import fs from "node:fs";


test("studio computes a stencil, shows 3D and exports STL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/studio");
  // engine boots and the first result renders
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/\d+ islands/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/studio-2d.png" });

  // change the text
  const area = page.locator("textarea").first();
  await area.fill("OAB8");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 20_000 });

  // 3D view
  await page.getByRole("button", { name: /3D/ }).first().click();
  await expect(page.getByText(/watertight/).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/studio-3d.png" });

  // export STL
  await page.getByRole("button", { name: /Export/ }).first().click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Download \.stl/ }).click()]);
  const path = await dl.path();
  const size = fs.statSync(path!).size;
  expect(size).toBeGreaterThan(5_000);
  expect(errors.filter((e) => !/WebGL|swiftshader|GPU/i.test(e))).toEqual([]);
});

test("bridge tool adds a manual bridge and delete removes it", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 45_000 });
  await page.evaluate(() =>
    window.__studio.getState().updateDoc((d: any) => {
      d.objects[0].content.font = "archivo-black";
      d.objects[0].content.text = "O";
      d.bridges.enabled = false;
    }),
  );
  await expect(page.locator("footer").getByText("1 islands")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("footer").getByText("0 bridges")).toBeVisible();
  // one island, no bridge yet => error badge
  await expect(page.locator("footer").getByText(/1 error/)).toBeVisible();

  // drag across the top of the O with the bridge tool
  const box = (await page.locator("main svg").first().boundingBox())!;
  await page.keyboard.press("b");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 150, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("footer").getByText("1 bridges")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/bridge-tool.png" });
  await expect(page.locator("footer").getByText("Print-ready")).toBeVisible();

  await page.keyboard.press("Delete");
  await expect(page.locator("footer").getByText("0 bridges")).toBeVisible({ timeout: 15_000 });
});

test("objects can be deleted and a new design can be started, both undoable", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 45_000 });
  const rows = page.locator("aside").first().locator("div.group");
  const toast = page.getByRole("status").filter({ has: page.getByRole("button", { name: "Undo" }) });

  // the only object can't be deleted
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();

  // add an object with "+", delete it from its row, undo from the toast
  await page.locator("aside").first().getByRole("button").first().click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Delete" }).last().click();
  await expect(rows).toHaveCount(1);
  await expect(toast).toContainText("Deleted");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(rows).toHaveCount(2);

  // the Delete key removes the selected object
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(1);

  // new design: reset to the default sample, then undo brings the edit back
  const area = page.locator("textarea").first();
  await area.fill("MINE");
  await expect(rows.first()).toContainText("MINE");
  await page.getByRole("button", { name: "New design" }).click();
  await expect(area).toHaveValue("STENCIL");
  await expect(toast).toContainText("new design");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(area).toHaveValue("MINE");
});
