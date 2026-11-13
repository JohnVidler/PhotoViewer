import puppeteer from "puppeteer-core";

// Usage: node e2e/<this file> <base url> <folder for screenshots>   (see e2e/README.md)
const [, , base, outDir] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 900 });
const logs = [];
page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const failedImages = [];
page.on("response", (r) => {
  if (r.url().includes("/api/thumbnail") && r.status() >= 400) failedImages.push(`${r.status()} ${r.url()}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (path) => {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await sleep(700);
};

// ---- sign in (setup form, first run)
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.type('input[aria-label="Username"]', "tester");
await page.type('input[aria-label="Password"]', "correct horse battery");
await page.type('input[aria-label="Confirm password"]', "correct horse battery");
await page.type('input[aria-label="Setup code"]', "code-1234567");
await page.click('button[type="submit"]');
await page.waitForSelector(".sidebar__user-name");

// ---- helpers that run inside the page (same session cookie)
const makePhoto = (folder, name, color) =>
  page.evaluate(async (folder, name, color) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const form = new FormData();
    form.append("f", blob, name);
    await fetch(`/api/upload?path=${encodeURIComponent(folder)}`, { method: "POST", body: form });
  }, folder, name, color);
const makeFolder = (parent, name) =>
  page.evaluate(
    (parent, name) =>
      fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: parent, name }) }),
    parent,
    name,
  );

// Drags the photo tiles whose aria-label matches `photoNames` onto the target (a main-area album tile or a sidebar entry).
const drag = (photoNames, targetSelector, targetText) =>
  page.evaluate(
    async (photoNames, targetSelector, targetText) => {
      const dt = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      const photo = [...document.querySelectorAll(".photo-tile")].find((t) => t.querySelector(".photo-card")?.getAttribute("aria-label")?.includes(photoNames[0]));
      const target = [...document.querySelectorAll(targetSelector)].find((a) => a.textContent.includes(targetText));
      if (!photo || !target) return { error: `missing ${!photo ? "photo" : "target"}` };
      fire(photo, "dragstart");
      await new Promise((r) => setTimeout(r, 50));
      fire(target, "dragenter");
      fire(target, "dragover");
      fire(target, "drop");
      fire(photo, "dragend");
      return { ok: true };
    },
    photoNames,
    targetSelector,
    targetText,
  );

// Reports what the album tile and sidebar entry show, including whether the <img> truly decoded.
const view = (albumText) =>
  page.evaluate((albumText) => {
    const describe = (el) => {
      if (!el) return "not on screen";
      const imgs = [...el.querySelectorAll("img")];
      const icon = !!el.querySelector(".folder-card__mosaic--empty, .sidebar__thumb--icon");
      return `${imgs.length} img (${imgs.filter((i) => i.complete && i.naturalWidth > 0).length} decoded)${icon ? ", folder icon" : ""}, count ${el.querySelector(".folder-card__count, .sidebar__count")?.textContent}`;
    };
    const tile = [...document.querySelectorAll(".folder-tile")].find((t) => t.textContent.includes(albumText));
    const side = [...document.querySelectorAll(".sidebar__list .sidebar__item")].find((t) => t.textContent.includes(albumText));
    return { tile: describe(tile), sidebar: describe(side) };
  }, albumText);

const watch = async (label, albumText) => {
  const states = [];
  for (const wait of [250, 700, 2200]) {
    await sleep(wait);
    states.push(await view(albumText));
  }
  const last = states[states.length - 1];
  console.log(`  ${label}\n    tile:    ${last.tile}\n    sidebar: ${last.sidebar}`);
  if (states.some((s, i) => i > 0 && JSON.stringify(s) !== JSON.stringify(states[i - 1])))
    console.log(`    (changed over time: ${states.map((s) => s.tile).join("  ->  ")})`);
};

// ------------------------------------------------------------------ scenarios
console.log("A. empty album at the top level, drop on its main-area tile");
await makeFolder("", "A-empty");
await makePhoto("", "red.png", "#e00");
await go("/");
console.log("  before:", JSON.stringify(await view("A-empty")));
console.log("  drag:", JSON.stringify(await drag(["red.png"], ".folder-card", "A-empty")));
await watch("after", "A-empty");

console.log("B. empty album, drop on its SIDEBAR entry");
await makeFolder("", "B-empty");
await makePhoto("", "green.png", "#0a0");
await go("/");
console.log("  before:", JSON.stringify(await view("B-empty")));
console.log("  drag:", JSON.stringify(await drag(["green.png"], ".sidebar__list .sidebar__item", "B-empty")));
await watch("after", "B-empty");

console.log("C. empty SUB-album inside an album (viewing the parent)");
await makeFolder("", "C-parent");
await makeFolder("C-parent", "C-sub");
await makePhoto("C-parent", "blue.png", "#00e");
await go("/C-parent");
console.log("  before:", JSON.stringify(await view("C-sub")));
console.log("  drag:", JSON.stringify(await drag(["blue.png"], ".folder-card", "C-sub")));
await watch("after (sub-album tile)", "C-sub");
await page.screenshot({ path: `${outDir}/C.png` });
await go("/");
console.log("  parent seen from the top level:", JSON.stringify(await view("C-parent")));

console.log("D. drop on a sidebar album while viewing a DIFFERENT album");
await makeFolder("", "D-empty");
await makePhoto("C-parent", "yellow.png", "#ee0");
await go("/C-parent");
console.log("  drag:", JSON.stringify(await drag(["yellow.png"], ".sidebar__list .sidebar__item", "D-empty")));
await sleep(2500);
console.log("  sidebar entry:", JSON.stringify((await view("D-empty")).sidebar));

console.log("E. photo that was in the album before: move out and back in");
await go("/");
await makePhoto("", "round.png", "#e0e");
await go("/");
await drag(["round.png"], ".folder-card", "A-empty");
await sleep(1500);
await go("/A-empty");
console.log("  moved out ->", JSON.stringify(await page.evaluate(async () => (await (await fetch("/api/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: ["A-empty/round.png", "A-empty/red.png"], destination: "" }) })).json()).moved.length)));
await go("/");
console.log("  A-empty is now empty again:", JSON.stringify(await view("A-empty")));
console.log("  drag back in:", JSON.stringify(await drag(["round.png"], ".folder-card", "A-empty")));
await watch("after", "A-empty");

console.log("F. two photos selected, dragged together onto an empty album");
await makeFolder("", "F-empty");
await makePhoto("", "p1.png", "#f80");
await makePhoto("", "p2.png", "#08f");
await go("/");
await page.evaluate(() => document.querySelectorAll(".photo-tile .select-box").forEach((b) => ((b.closest(".photo-tile").textContent.includes("p1") || b.closest(".photo-tile").textContent.includes("p2")) && b.click())));
console.log("  drag:", JSON.stringify(await drag(["p1.png"], ".folder-card", "F-empty")));
await watch("after", "F-empty");

console.log("\nfailed thumbnail requests:", failedImages.length ? failedImages.join("\n") : "none");
console.log(logs.filter((l) => !l.includes("favicon")).join("\n") || "no console errors");
await browser.close();
