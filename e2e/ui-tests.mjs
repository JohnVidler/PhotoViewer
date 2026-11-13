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
page.on("console", (m) => m.type() === "error" && logs.push(`[console.error] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
const failedImages = [];
page.on("response", (r) => r.url().includes("/api/thumbnail") && r.status() >= 400 && failedImages.push(`${r.status()} ${r.url()}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  ok ? passed++ : failed++;
};
// Waits until the page has finished loading the library listing (tiles or the empty message are present).
const go = async (path) => {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".page__title");
  await page.waitForFunction(() => !document.querySelector(".state-message")?.textContent.includes("Loading"), { timeout: 8000 });
  await sleep(250);
};

const newAlbumTile = () => page.$(".new-album-tile");
const tileIsLastInGrid = () =>
  page.evaluate(() => {
    const grid = document.querySelector(".folder-grid");
    return !!grid && grid.lastElementChild?.classList.contains("new-album-tile");
  });
const api = (path, body) =>
  page.evaluate(
    (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()),
    path,
    body,
  );
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

// ---- sign in via the setup form
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.type('input[aria-label="Username"]', "tester");
await page.type('input[aria-label="Password"]', "correct horse battery");
await page.type('input[aria-label="Confirm password"]', "correct horse battery");
await page.type('input[aria-label="Setup code"]', "code-1234567");
await page.click('button[type="submit"]');
await page.waitForSelector(".sidebar__user-name");

console.log("New album tile: visibility rules");
await go("/");
check("empty library (no albums, no photos): tile is shown", !!(await newAlbumTile()));
await page.screenshot({ path: `${outDir}/tile-empty.png` });

await makePhoto("", "bare.png", "#e00");
await go("/");
check("only bare photos at the top level, no albums: tile is hidden", !(await newAlbumTile()));

await api("/api/folders", { path: "", name: "First" });
await go("/");
check("has albums (and bare photos): tile is shown", !!(await newAlbumTile()));
check("tile comes after the real album tiles", await tileIsLastInGrid());
await page.screenshot({ path: `${outDir}/tile-with-albums.png` });

console.log("New album tile: creating an album");
await page.click(".new-album-tile__button");
await page.waitForSelector(".new-album-tile input");
await page.keyboard.press("Escape");
check("Escape cancels without creating anything", (await page.$$(".folder-tile")).length === 1 && !!(await page.$(".new-album-tile__button")));
await page.click(".new-album-tile__button");
await page.type(".new-album-tile input", "Second");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelectorAll(".folder-tile").length === 2, { timeout: 5000 }).catch(() => {});
check("typing a name and pressing Enter adds the album tile", (await page.$$(".folder-tile")).length === 2);
check("the New album tile is still last, and collapsed again", (await tileIsLastInGrid()) && !!(await page.$(".new-album-tile__button")));
await page.click(".new-album-tile__button");
await page.type(".new-album-tile input", "Second");
await page.keyboard.press("Enter");
await page.waitForSelector(".new-album-tile__error", { timeout: 3000 }).catch(() => {});
check("a duplicate name shows an error inside the tile", !!(await page.$(".new-album-tile__error")));
await page.keyboard.press("Escape");

await go("/First");
check("inside an album there is no New album tile", !(await newAlbumTile()));

console.log("Photo viewer: closing");
await go("/");
const viewerOpen = () => page.$(".viewer").then(Boolean);
const open = async () => {
  await page.click(".photo-card");
  await page.waitForSelector(".viewer");
};
await open();
check("viewer opens", await viewerOpen());
await page.click(".viewer__image");
check("clicking the photo does NOT close it", await viewerOpen());
await page.click(".viewer__caption");
check("clicking the caption does NOT close it", await viewerOpen());
await page.mouse.click(20, 450); // dimmed background, left margin
await sleep(200);
check("clicking the dimmed background closes it", !(await viewerOpen()));

await open();
await page.mouse.click(1280, 880); // bottom-right corner of the backdrop
await sleep(200);
check("clicking another part of the background closes it", !(await viewerOpen()));

await open();
await page.click('.viewer__button[aria-label="Close"]');
await sleep(200);
check("the X button still closes it", !(await viewerOpen()));

await open();
await page.click('.viewer__button[aria-label="Photo details"]');
await page.waitForSelector(".info-modal");
await page.click(".info-modal__panel");
check("clicking inside the details panel does NOT close the viewer", await viewerOpen());
await page.keyboard.press("Escape");
await sleep(200);
await page.keyboard.press("Escape");
await sleep(200);
check("Escape still closes (details first, then the viewer)", !(await viewerOpen()));

console.log("Thumbnails: photo moved into an album that used to hold the same photo");
await api("/api/folders", { path: "", name: "Again" });
await makePhoto("", "round.png", "#e0e");
await go("/");
const dragPhotoOnto = (albumText) =>
  page.evaluate(
    async (albumText) => {
      const dt = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      const photo = [...document.querySelectorAll(".photo-tile")].find((t) => t.textContent.includes("round"));
      const target = [...document.querySelectorAll(".folder-card")].find((a) => a.textContent.includes(albumText));
      fire(photo, "dragstart");
      await new Promise((r) => setTimeout(r, 50));
      fire(target, "dragenter");
      fire(target, "dragover");
      fire(target, "drop");
      fire(photo, "dragend");
    },
    albumText,
  );
const tileDecoded = (albumText) =>
  page.evaluate((albumText) => {
    const tile = [...document.querySelectorAll(".folder-tile")].find((t) => t.textContent.includes(albumText));
    const imgs = tile ? [...tile.querySelectorAll("img")] : [];
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, albumText);
await dragPhotoOnto("Again");
await sleep(2000);
check("first time in: album tile shows the photo", await tileDecoded("Again"));
await api("/api/move", { paths: ["Again/round.png"], destination: "" });
await go("/");
check("moved back out: album is empty again", !(await tileDecoded("Again")));
await dragPhotoOnto("Again");
await sleep(2000);
check("second time in: album tile shows the photo again", await tileDecoded("Again"));

console.log(`\nfailed thumbnail requests: ${failedImages.length ? failedImages.join(", ") : "none"}`);
console.log(logs.length ? logs.join("\n") : "no console errors");
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
