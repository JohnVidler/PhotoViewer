import { Router } from "express";
import path from "node:path";
import { requireUser } from "../middleware/auth";
import { findInvite, redeemInvite } from "../services/shares";

export const invitesRouter = Router();

/**
 * GET /api/invites/:token  what an invite link offers, so the page can say so before asking the visitor to sign in.
 * Needs no account: the unguessable token is the credential, and it reveals only the album's name and owner.
 */
invitesRouter.get("/:token", (req, res) => {
  const invite = findInvite(req.params["token"] ?? "");
  res.set("Cache-Control", "no-store");
  if (!invite) {
    res.status(404).json({ error: "This invite link isn't valid. It may have been switched off." });
    return;
  }

  res.json({
    albumName: path.posix.basename(invite.path),
    ownerName: invite.ownerLabel,
    canWrite: invite.canWrite,
    available: invite.uses < invite.maxUses,
  });
});

/** POST /api/invites/:token/redeem  adds the album to the signed-in user's account ("Shared With Me"). */
invitesRouter.post("/:token/redeem", requireUser, (req, res) => {
  const result = redeemInvite(req.params["token"] ?? "", req.user!.id);
  if (result.ok) {
    res.json({ path: `.shared/${result.shareId}`, alreadyHadAccess: result.alreadyHadAccess });
    return;
  }

  switch (result.reason) {
    case "not_found":
      res.status(404).json({ error: "This invite link isn't valid. It may have been switched off." });
      return;
    case "exhausted":
      res.status(410).json({ error: "This invite link has already been used the maximum number of times." });
      return;
    case "own_album":
      res.status(400).json({ error: "That's your own album, so there's nothing to add." });
      return;
  }
});
