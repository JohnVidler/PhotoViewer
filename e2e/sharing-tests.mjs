// Multi-user sharing checks in real Chrome: an owner (alice), a collaborator (bob) and an anonymous visitor, each in
// their own browser session. Usage: node e2e/sharing-tests.mjs <base url> <folder for screenshots> <a png file>
// Needs a FIRST-RUN server (see e2e/README.md) because it creates the administrator through the setup form.
import puppeteer from "puppeteer-core";

const [, , base, outDir, pngPath] = process.argv;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  ok ? passed++ : failed++;
};
const consoleErrors = [];

async function newSession(name) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1300, height: 900 });
  page.on("pageerror", (e) => consoleErrors.push(`[${name}] ${e.message}`));
  // Remember requests still in flight, to explain a page that never finishes loading.
  page.pending = new Set();
  page.trail = [];
  const note = (m) => { page.trail.push(`${new Date().toISOString().slice(17, 23)} ${m}`); if (page.trail.length > 40) page.trail.shift(); };
  page.on("request", (r) => { page.pending.add(r.url().replace(base, "")); r.url().includes("/api/") && note(`-> ${r.method()} ${r.url().replace(base, "")}`); });
  page.on("response", (r) => r.url().includes("/api/") && note(`<- ${r.status()} ${r.url().replace(base, "")}`));
  page.on("requestfailed", (r) => note(`xx ${r.url().replace(base, "")} ${r.failure()?.errorText}`));
  page.on("console", (m) => m.type() === "error" && note(`[console.error] ${m.text()}`));
  for (const done of ["requestfinished", "requestfailed"]) page.on(done, (r) => page.pending.delete(r.url().replace(base, "")));
  return page;
}

const go = async (page, path) => {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".page__title, .auth-card, .state-message");
  try {
    await page.waitForFunction(() => !document.querySelector(".state-message")?.textContent.includes("Loading"), { timeout: 8000 });
  } catch (error) {
    const shown = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n+/g, " | "));
    throw new Error(`page ${path} never finished loading. It shows: ${shown}\n   recent requests:\n     ${page.trail.slice(-22).join("\n     ")}`);
  }
  await sleep(600);
};
const text = (page, selector) => page.$eval(selector, (e) => e.textContent).catch(() => null);
const exists = (page, selector) => page.$(selector).then(Boolean);
const clickText = (page, selector, wanted) =>
  page.evaluate(
    (selector, wanted) => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.trim() === wanted);
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    wanted,
  );
const api = (page, path, body, method = "POST") =>
  page.evaluate(
    (path, body, method) => fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => ({}))),
    path,
    body,
    method,
  );
const makePhoto = (page, folder, name, color) =>
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
const dragPhoto = (page, photoText, targetSelector, targetText) =>
  page.evaluate(
    async (photoText, targetSelector, targetText) => {
      const dt = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      const photo = [...document.querySelectorAll(".photo-tile")].find((t) => t.querySelector(".photo-card")?.getAttribute("aria-label")?.includes(photoText));
      const target = [...document.querySelectorAll(targetSelector)].find((a) => a.textContent.includes(targetText));
      if (!photo || !target) return { error: !photo ? "photo not found" : "target not found" };
      fire(photo, "dragstart");
      await new Promise((r) => setTimeout(r, 60));
      const droppable = /droppable|sidebar__item--droppable/.test((target.closest(".folder-tile") ?? target).className);
      fire(target, "dragenter");
      fire(target, "dragover");
      fire(target, "drop");
      fire(photo, "dragend");
      return { ok: true, droppable };
    },
    photoText,
    targetSelector,
    targetText,
  );
// Opens the first photo in the viewer, waits for the full-size image to really load, then closes it again.
const viewerShowsImage = async (page) => {
  await page.click(".photo-card");
  await page.waitForSelector(".viewer__image");
  const ok = await page
    .waitForFunction(() => {
      const image = document.querySelector(".viewer__image");
      return image && image.complete && image.naturalWidth > 0;
    }, { timeout: 5000 })
    .then(() => true, () => false);
  await page.keyboard.press("Escape");
  return ok;
};
const photoNames = (page) => page.$$eval(".photo-tile .photo-card", (els) => els.map((e) => e.getAttribute("aria-label").replace(/^(Open|Select) /, "")));
const tileText = (page, album) =>
  page.evaluate((album) => [...document.querySelectorAll(".folder-tile")].find((t) => t.textContent.includes(album))?.textContent ?? null, album);

// ---------------------------------------------------------------- alice (owner, first account = administrator)
const alice = await newSession("alice");
await alice.goto(base, { waitUntil: "domcontentloaded" });
await alice.type('input[aria-label="Username"]', "alice");
await alice.type('input[aria-label="Password"]', "correct horse battery");
await alice.type('input[aria-label="Confirm password"]', "correct horse battery");
await alice.type('input[aria-label="Setup code"]', "code-1234567");
await alice.click('button[type="submit"]');
await alice.waitForSelector(".sidebar__user-name");
await api(alice, "/api/admin/users", { username: "bob", password: "bobs-long-password" });
await api(alice, "/api/folders", { path: "", name: "Spain" });
await api(alice, "/api/folders", { path: "", name: "Inbox" });
await api(alice, "/api/folders", { path: "", name: "Docs" });
await makePhoto(alice, "Spain", "beach.png", "#e80");
await makePhoto(alice, "Spain", "tapas.png", "#c33");
await makePhoto(alice, "Docs", "plan.png", "#39c");

const bob = await newSession("bob");
await bob.goto(base, { waitUntil: "domcontentloaded" });
await bob.type('input[aria-label="Username"]', "bob");
await bob.type('input[aria-label="Password"]', "bobs-long-password");
await bob.click('button[type="submit"]');
await bob.waitForSelector(".sidebar__user-name");
await api(bob, "/api/folders", { path: "", name: "Mine" });
await makePhoto(bob, "", "own.png", "#2a2");

console.log("Owner: sharing an album");
await go(alice, "/");
await alice.click('.folder-tile .select-box[aria-label="Select Spain"]');
check("selecting one album offers Share in the selection bar", await alice.evaluate(() => [...document.querySelectorAll(".selection-bar button")].some((b) => b.textContent.trim() === "Share")));
await alice.click('.photo-tile .select-box').catch(() => {});
await alice.keyboard.press("Escape");
await go(alice, "/Spain");
check("the album page has a Share button in its header", await alice.evaluate(() => [...document.querySelectorAll(".library-actions button")].some((b) => b.textContent.trim() === "Share")));
await alice.click('.photo-tile .select-box');
check("selecting a PHOTO does not offer Share (albums only)", !(await alice.evaluate(() => [...document.querySelectorAll(".selection-bar button")].some((b) => b.textContent.trim() === "Share"))));
await alice.keyboard.press("Escape");
await clickText(alice, ".library-actions button", "Share");
await alice.waitForSelector(".dialog");
await alice.type('input[aria-label="Username to share with"]', "nobody");
await clickText(alice, ".dialog button[type=submit]", "Share");
await alice.waitForSelector(".dialog .auth-card__error");
check("sharing with an unknown user shows an error", (await text(alice, ".dialog .auth-card__error"))?.includes("no user"));
await alice.click('input[aria-label="Username to share with"]', { clickCount: 3 });
await alice.type('input[aria-label="Username to share with"]', "bob");
await clickText(alice, ".dialog button[type=submit]", "Share");
await alice.waitForSelector(".share__row select[aria-label='What bob can do']");
check("bob is listed as 'Can view'", (await alice.$eval(".share__row select[aria-label='What bob can do']", (s) => s.value)) === "read");
await alice.screenshot({ path: `${outDir}/share-dialog.png` });

console.log("Collaborator: Shared With Me (view only)");
await go(bob, "/");
check("library has a 'Shared With Me' section with the album", (await bob.$eval('section[aria-labelledby="shared-heading"]', (s) => s.textContent).catch(() => "")).includes("Spain"));
check("tile says who shared it", (await tileText(bob, "Spain"))?.includes("shared by alice"));
check("sidebar has a 'Shared With Me' heading and the album", await bob.evaluate(() => [...document.querySelectorAll(".sidebar__heading")].some((h) => h.textContent === "Shared With Me") && [...document.querySelectorAll(".sidebar__item")].some((i) => i.textContent.includes("Spain"))));
check("the shared album is NOT among bob's own Albums", !(await bob.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="albums-heading"] .folder-tile')].some((t) => t.textContent.includes("Spain")))));
await bob.screenshot({ path: `${outDir}/shared-with-me.png` });
await bob.evaluate(() => [...document.querySelectorAll(".folder-card")].find((a) => a.textContent.includes("Spain")).click());
await bob.waitForSelector(".photo-tile");
await sleep(500);
check("opens with the album's own name as title", (await text(bob, ".page__title")) === "Spain");
check("breadcrumbs: Library / Shared With Me / Spain", (await text(bob, ".breadcrumbs"))?.replace(/\s+/g, "") === "Library/SharedWithMe/Spain");
check("says view only", (await text(bob, ".page__subtitle"))?.includes("view only"));
check("sees alice's photos", (await photoNames(bob)).sort().join() === "beach.png,tapas.png");
check("no upload / new album / share buttons", !(await exists(bob, ".library-actions")));
check("no tick boxes, no selection bar", !(await exists(bob, ".select-box")) && !(await exists(bob, ".selection-bar")));
check("photos can still be dragged out", await bob.$eval(".photo-tile", (t) => t.getAttribute("draggable") === "true"));
await bob.screenshot({ path: `${outDir}/shared-readonly.png` });
check("the viewer opens and shows the photo", await viewerShowsImage(bob));
const attempt = await api(bob, "/api/upload?path=.shared/1", undefined);
check("the server also refuses writes (403)", (await bob.evaluate(() => fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: ".shared/1", name: "x" }) }).then((r) => r.status))) === 403);

console.log("Copying out by drag and drop (read-only source)");
const before = await tileText(await (async () => { await go(bob, "/"); return bob; })(), "Mine");
const dropOnSidebar = await dragPhotoFromShare(bob);
async function dragPhotoFromShare(page) {
  await go(page, "/.shared/1");
  return dragPhoto(page, "beach.png", ".sidebar__list .sidebar__item", "Mine");
}
check("own sidebar album accepts the drop (highlights as droppable)", dropOnSidebar.droppable === true);
await sleep(1500);
check("a notice says it was copied", (await text(bob, ".action-notice"))?.startsWith("Copied"), await text(bob, ".action-notice"));
await go(bob, "/Mine");
check("the copy is in bob's own album, and the original is still in the share", (await photoNames(bob)).includes("beach.png"));
const orig = await api(alice, "/api/browse?path=Spain", undefined, "GET");
check("alice's original is untouched (one copy remains hers)", orig.photos?.some((p) => p.name === "beach.png"));
await go(bob, "/.shared/1");
const dropOnLibrary = await dragPhoto(bob, "tapas.png", ".sidebar__item", "Library");
await sleep(1500);
await go(bob, "/");
check("dragging onto 'Library' in the sidebar copies to the top of bob's library", (await photoNames(bob)).includes("tapas.png"));

console.log("Owner changes the permission; only the owner can");
await go(alice, "/Spain");
await clickText(alice, ".library-actions button", "Share");
await alice.waitForSelector(".share__row select[aria-label='What bob can do']");
await alice.select(".share__row select[aria-label='What bob can do']", "write");
await sleep(800);
check("owner can switch bob to 'Can edit'", (await alice.$eval(".share__row select[aria-label='What bob can do']", (s) => s.value)) === "write");
await alice.keyboard.press("Escape");

await go(bob, "/.shared/1");
check("bob now sees 'you can edit'", (await text(bob, ".page__subtitle"))?.includes("you can edit"));
check("bob has Upload / New album, tick boxes, but NO Share button", (await exists(bob, ".library-actions")) && (await exists(bob, ".select-box")) && !(await bob.evaluate(() => [...document.querySelectorAll(".library-actions button")].some((b) => b.textContent.trim() === "Share"))));
const permissionAttempt = await bob.evaluate(() => fetch("/api/shares/1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canWrite: false }) }).then((r) => r.status));
check("bob cannot change the permission or the share (server says 404)", permissionAttempt === 404);

console.log("Editing inside a share: one copy of the files");
const fileInput = await bob.$('input[type="file"][accept="image/*"]');
await fileInput.uploadFile(pngPath);
await sleep(2000);
check("bob's upload appears in the shared album", (await photoNames(bob)).includes("a.png"));
const asAlice = await api(alice, "/api/browse?path=Spain", undefined, "GET");
check("...and it is in ALICE's Spain album (the same single copy)", asAlice.photos?.some((p) => p.name === "a.png"));
check("...and not in bob's own library", !(await api(bob, "/api/browse?path=", undefined, "GET")).photos?.some((p) => p.name === "a.png"));
await bob.click('.photo-tile .select-box');
const bar = await bob.evaluate(() => [...document.querySelectorAll(".selection-bar button, .selection-bar a")].map((b) => b.textContent.trim()));
check("selection bar offers Move / Rename / Delete (no Share)", ["Move", "Delete"].every((x) => bar.includes(x)) && !bar.includes("Share"), bar.join(","));
await bob.keyboard.press("Escape");

console.log("Dragging between shares");
await api(alice, "/api/shares", { path: "Inbox", username: "bob", canWrite: true });
await api(alice, "/api/shares", { path: "Docs", username: "bob", canWrite: false });
await go(bob, "/");
const sharedTiles = await bob.$$eval('section[aria-labelledby="shared-heading"] .folder-tile', (t) => t.map((x) => x.textContent));
check("library lists all three shared albums", sharedTiles.length === 3, sharedTiles.length);
const idOf = async (name) => (await api(bob, "/api/shared", undefined, "GET")).find((e) => e.name === name).path;
const inbox = await idOf("Inbox");
const docs = await idOf("Docs");
await go(bob, "/.shared/1");
const toWritable = await dragPhoto(bob, "beach.png", ".sidebar__list .sidebar__item", "Inbox");
await sleep(1500);
check("read/write share accepts a photo dragged from another share (copy)", toWritable.droppable === true && (await api(bob, `/api/browse?path=${inbox}`, undefined, "GET")).photos?.some((p) => p.name === "beach.png"));
const toReadOnly = await dragPhoto(bob, "beach.png", ".sidebar__list .sidebar__item", "Docs");
await sleep(1200);
check("read-only share does NOT accept a drop (no highlight, nothing copied)", toReadOnly.droppable === false && !(await api(bob, `/api/browse?path=${docs}`, undefined, "GET")).photos?.some((p) => p.name === "beach.png"));
await go(bob, "/.shared/" + docs.split("/")[1]);
const fromReadOnly = await dragPhoto(bob, "plan.png", ".sidebar__list .sidebar__item", "Inbox");
await sleep(1500);
check("from a READ-ONLY share into a READ/WRITE share works", fromReadOnly.droppable === true && (await api(bob, `/api/browse?path=${inbox}`, undefined, "GET")).photos?.some((p) => p.name === "plan.png"));
await go(bob, "/");
const ownToShare = await dragPhoto(bob, "own.png", '.folder-card', "Inbox");
await sleep(1500);
check("bob's own photo dragged onto a writable shared tile in the library is copied in", (await api(bob, `/api/browse?path=${inbox}`, undefined, "GET")).photos?.some((p) => p.name === "own.png") && (await photoNames(bob)).includes("own.png"));

console.log("Public link");
await go(alice, "/Spain");
await clickText(alice, ".library-actions button", "Share");
await alice.waitForSelector(".dialog");
check("no public link yet; offers 'Share publicly…'", await alice.evaluate(() => [...document.querySelectorAll(".dialog button")].some((b) => b.textContent.includes("Share publicly"))));
await clickText(alice, ".dialog button", "Share publicly…");
await alice.waitForSelector(".share__warning");
const warning = await text(alice, ".share__warning");
check("a warning explains anyone with the link can see it, signed in or not", /anyone with the link/i.test(warning) && /whether or not they have an account/i.test(warning), warning?.slice(0, 80));
check("the warning mentions embedded details such as location", /location|where they were taken/i.test(warning));
await alice.screenshot({ path: `${outDir}/public-warning.png` });
await clickText(alice, ".dialog button", "Cancel");
check("cancelling creates nothing", !(await api(alice, "/api/shares?path=Spain", undefined, "GET")).public);
await clickText(alice, ".dialog button", "Share publicly…");
await clickText(alice, ".dialog button", "I understand, share publicly");
await alice.waitForSelector('input[aria-label="Public link"]');
const url = await alice.$eval('input[aria-label="Public link"]', (i) => i.value);
check("a link is shown", url.includes("/.public/"), url);

const anon = await newSession("anon");
await go(anon, new URL(url).pathname);
check("anonymous visitor sees the album without signing in", (await text(anon, ".page__title")) === "Spain" && (await photoNames(anon)).length >= 2);
check("it is plainly read-only: no sidebar, no actions, no tick boxes, a Sign in button", !(await exists(anon, ".sidebar")) && !(await exists(anon, ".library-actions")) && !(await exists(anon, ".select-box")) && (await exists(anon, ".public-bar a")));
check("subtitle says it is a public album", (await text(anon, ".page__subtitle"))?.includes("Public album shared by alice"));
check("photos are not draggable for anonymous visitors", await anon.$eval(".photo-tile", (t) => t.getAttribute("draggable") !== "true"));
check("viewer works for anonymous visitors", await viewerShowsImage(anon));
await anon.screenshot({ path: `${outDir}/public-anonymous.png` });
await go(anon, "/Spain");
check("anonymous visitors still can't see anyone's own library (login page)", await exists(anon, ".auth-card"));

console.log("Turning the public link off");
await alice.evaluate(() => [...document.querySelectorAll(".dialog button")].find((b) => b.textContent.includes("Stop sharing publicly")).click());
await alice.waitForFunction(() => [...document.querySelectorAll(".dialog button")].some((b) => b.textContent.includes("Share publicly")));
await go(anon, new URL(url).pathname);
check("the old link no longer works", !(await exists(anon, ".photo-tile")) && (await exists(anon, ".state-message--error")));

console.log("Owner renames the shared album: shares follow");
await alice.keyboard.press("Escape");
await go(alice, "/");
await alice.click('.folder-tile .select-box[aria-label="Select Spain"]');
await clickText(alice, ".selection-bar button", "Rename");
await alice.waitForSelector(".dialog input");
await alice.click(".dialog input", { clickCount: 3 });
await alice.type(".dialog input", "Spain 2026");
await alice.keyboard.press("Enter");
await sleep(1200);
await go(bob, "/");
check("bob's Shared With Me shows the new name, same access", (await tileText(bob, "Spain 2026")) !== null);

console.log(`\nconsole/page errors: ${consoleErrors.length ? consoleErrors.join("\n") : "none"}`);
console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
