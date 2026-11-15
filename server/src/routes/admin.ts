import express, { Router } from "express";
import { passwordProblem } from "../services/passwords";
import { listAllLinks, removeLinkAsAdmin } from "../services/shares";
import {
  createUser,
  deleteUser,
  ensureUserRoot,
  getUserById,
  listUsers,
  setPassword,
  setSignupsEnabled,
  setUserStatus,
  signupsEnabled,
} from "../services/users";

export const adminRouter = Router();

adminRouter.use(express.json({ limit: "10kb" }));

adminRouter.get("/users", (_req, res) => {
  res.json({
    signupsEnabled: signupsEnabled(),
    users: listUsers().map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    })),
  });
});

adminRouter.put("/settings", (req, res) => {
  const body = req.body as { signupsEnabled?: unknown };
  if (typeof body.signupsEnabled !== "boolean") {
    res.status(400).json({ error: "signupsEnabled must be a boolean" });
    return;
  }

  setSignupsEnabled(body.signupsEnabled);
  res.json({ signupsEnabled: signupsEnabled() });
});

/** Creates an account directly, so people can be added even while self-service sign-up is switched off. */
adminRouter.post("/users", async (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const result = await createUser(body.username, body.password, "user");

  if (!result.ok) {
    res.status(result.reason === "unavailable" ? 409 : 400).json({ error: result.error });
    return;
  }

  await ensureUserRoot(result.user);
  res.status(201).json({ id: result.user.id });
});

function targetUser(req: express.Request, res: express.Response) {
  const id = Number.parseInt(req.params["id"] ?? "", 10);
  const user = Number.isInteger(id) ? getUserById(id) : null;

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  // Administrators can't lock, reset or remove themselves (or each other), so the install can't be left without one.
  // An administrator changes their own password from the account menu instead.
  if (user.role === "admin") {
    res.status(400).json({ error: "Administrator accounts can't be changed from here" });
    return null;
  }

  return user;
}

adminRouter.patch("/users/:id", (req, res) => {
  const user = targetUser(req, res);
  if (!user) {
    return;
  }

  const status = (req.body as { status?: unknown }).status;
  if (status !== "active" && status !== "locked") {
    res.status(400).json({ error: "status must be 'active' or 'locked'" });
    return;
  }

  setUserStatus(user.id, status);
  res.json({ ok: true });
});

/** Sets a new password for a user (for when they've forgotten it) and signs them out everywhere. */
adminRouter.post("/users/:id/password", async (req, res) => {
  const user = targetUser(req, res);
  if (!user) {
    return;
  }

  const password = (req.body as { password?: unknown }).password;
  const problem = typeof password === "string" ? passwordProblem(password) : "Enter a password.";
  if (problem || typeof password !== "string") {
    res.status(400).json({ error: problem ?? "Enter a password." });
    return;
  }

  await setPassword(user.id, password);
  res.json({ ok: true });
});

adminRouter.delete("/users/:id", async (req, res) => {
  const user = targetUser(req, res);
  if (!user) {
    return;
  }

  try {
    await deleteUser(user, req.query["deletePhotos"] === "1");
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete user", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

/** Every public and invite link on the install. */
adminRouter.get("/links", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ links: listAllLinks() });
});

adminRouter.delete("/links/:kind/:id", (req, res) => {
  const kind = req.params["kind"];
  const id = Number.parseInt(req.params["id"] ?? "", 10);
  if ((kind !== "public" && kind !== "invite") || !Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid link" });
    return;
  }
  if (!removeLinkAsAdmin(kind, id)) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  res.json({ ok: true });
});
