import { test, expect, type Page } from "@playwright/test";


async function ready(page: Page) {
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 45_000 });
}
async function patch(page: Page, fn: string) {
  await page.evaluate((src) => {
    const st = window.__studio.getState();
    // eslint-disable-next-line no-new-func
    new Function("st", `return (${src})(st)`)(st);
  }, fn);
  await page.waitForTimeout(900);
  await ready(page);
}

test("visual tour", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/v0-landing.png", fullPage: false });

  await page.goto("/studio");
  await ready(page);

  // classic bridges on a regular font
  await patch(page, `(st) => st.updateDoc((d) => { d.objects[0].content.font = "archivo-black"; d.objects[0].content.text = "OAB8 42"; })`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/v1-classic.png" });

  // floating bridges, split view
  await patch(page, `(st) => { st.updateDoc((d) => { d.bridges.kind = "floating"; d.thickness = 2.4; }); st.setView("split"); }`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/v2-floating-split.png" });

  // inverse mode, 3D
  await patch(page, `(st) => { st.updateDoc((d) => { d.mode = "positive"; d.bridges.kind = "classic"; }); st.setView("design"); }`);
  await page.screenshot({ path: "test-results/v3-inverse.png" });

  // badge template (arc text) in 3D
  await patch(page, `(st) => { st.replaceDoc(${"JSON.parse(JSON.stringify(st.doc))"}); st.updateDoc((d) => { d.mode = "negative"; d.objects[0].content.text = "WORKSHOP 24/7"; d.objects[0].content.font = "bebas-neue"; d.objects[0].content.size = 40; d.objects[0].content.tracking = 4; d.objects[0].content.arc = { radius: 70, inside: false, centerAngle: 90 }; d.slab.shape = "ellipse"; d.slab.margins = { top: 12, right: 12, bottom: 12, left: 12 }; }); st.setView("3d"); }`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/v4-badge-3d.png" });

  await patch(page, `(st) => st.setView("design")`);
  await page.getByRole("button", { name: /Export/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/v5-export.png" });
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/v6-palette.png" });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Bebas Neue/ }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/v7-fonts.png" });
});
