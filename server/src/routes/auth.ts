import express, { Router, type Request } from "express";
import { requireUser } from "../middleware/auth";
import { clearFailures, recordFailure, retryAfterSeconds } from "../services/loginLimiter";
import { passwordProblem } from "../services/passwords";
import { createSession, destroySession, userFromRequest } from "../services/sessions";
import { setupCodeMatches } from "../services/setupCode";
import {
  authenticate,
  checkPassword,
  countUsers,
  createUser,
  ensureUserRoot,
  setPassword,
  signupsEnabled,
  type UserRecord,
} from "../services/users";

export const authRouter = Router();

// Credentials are tiny; refuse anything bigger rather than parse it.
const parseJson = express.json({ limit: "10kb" });

function publicUser(user: UserRecord) {
  return { id: user.id, username: user.username, role: user.role };
}

function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Tells the client who is signed in, and whether this is a brand-new install awaiting its administrator. */
authRouter.get("/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  const user = userFromRequest(req);

  res.json({
    setupRequired: countUsers() === 0,
    signupsEnabled: signupsEnabled(),
    user: user ? publicUser(user) : null,
  });
});

/** First run only: creates the administrator. Needs the setup code printed in the server log. */
authRouter.post("/setup", parseJson, async (req, res) => {
  const ip = clientIp(req);
  const waitSeconds = retryAfterSeconds(ip, "setup");
  if (waitSeconds > 0) {
    res.set("Retry-After", String(waitSeconds)).status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  if (countUsers() > 0) {
    res.status(409).json({ error: "This server has already been set up." });
    return;
  }

  const body = req.body as { username?: unknown; password?: unknown; setupCode?: unknown };
  if (!setupCodeMatches(body.setupCode)) {
    recordFailure(ip, "setup");
    res.status(403).json({ error: "That setup code isn't right. It is printed in the server log when it starts." });
    return;
  }

  const result = await createUser(body.username, body.password, "admin");
  if (!result.ok) {
    res.status(result.reason === "already_set_up" ? 409 : 400).json({ error: result.error });
    return;
  }

  await ensureUserRoot(result.user);
  createSession(res, result.user);
  console.log(`Created administrator account "${result.user.username}"`);
  res.json({ user: publicUser(result.user) });
});

/** Self-service account creation, available while the administrator allows sign-ups. */
authRouter.post("/register", parseJson, async (req, res) => {
  if (countUsers() === 0) {
    res.status(409).json({ error: "This server hasn't been set up yet." });
    return;
  }

  if (!signupsEnabled()) {
    res.status(403).json({ error: "New accounts are currently disabled. Ask an administrator for an account." });
    return;
  }

  const body = req.body as { username?: unknown; password?: unknown };
  const result = await createUser(body.username, body.password, "user");
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  await ensureUserRoot(result.user);
  createSession(res, result.user);
  res.status(201).json({ user: publicUser(result.user) });
});

authRouter.post("/login", parseJson, async (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const username = text(body.username);
  const ip = clientIp(req);

  const waitSeconds = retryAfterSeconds(ip, username);
  if (waitSeconds > 0) {
    res.set("Retry-After", String(waitSeconds)).status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(waitSeconds / 60)} minute(s).`,
    });
    return;
  }

  const result = await authenticate(username, body.password);

  if (!result.ok) {
    if (result.reason === "locked") {
      res.status(403).json({ error: "This account has been locked by an administrator." });
      return;
    }

    recordFailure(ip, username);
    res.status(401).json({ error: "Incorrect username or password." });
    return;
  }

  clearFailures(ip, username);
  await ensureUserRoot(result.user);
  createSession(res, result.user);
  res.json({ user: publicUser(result.user) });
});

authRouter.post("/logout", (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

/** Changes the signed-in user's password, ending every session (including this one) and starting a fresh one. */
authRouter.post("/password", requireUser, parseJson, async (req, res) => {
  const user = req.user!;
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const ip = clientIp(req);

  const waitSeconds = retryAfterSeconds(ip, user.username);
  if (waitSeconds > 0) {
    res.set("Retry-After", String(waitSeconds)).status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  // A stolen session must not be enough to take over the account, so the old password is required.
  if (!(await checkPassword(user.id, text(body.currentPassword)))) {
    recordFailure(ip, user.username);
    res.status(400).json({ error: "Your current password isn't right." });
    return;
  }

  const newPassword = text(body.newPassword);
  const problem = passwordProblem(newPassword);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }

  await setPassword(user.id, newPassword);
  createSession(res, user);
  res.json({ ok: true });
});
