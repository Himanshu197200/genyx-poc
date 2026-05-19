/**
 * index.ts — Genyx auth-svc entry point
 *
 * Routes:
 *   GET  /health                        → 200 OK
 *   GET  /.well-known/jwks.json         → public keys (JWKS)
 *   POST /auth/login                    → email/password
 *   POST /auth/google                   → OAuth code exchange
 *   POST /auth/refresh                  → rotate refresh token
 *   POST /auth/mqtt-credential          → mint mqttJwt (requires Bearer)
 *   POST /_dev/mint-test-jwt            → mint test JWT (dev only, no auth)
 */

import express from "express";
import { keysReady, requireAuth, sign } from "./auth/jwt";
import { jwksHandler } from "./auth/jwks";
import { loginHandler, refreshHandler } from "./auth/password";
import { googleHandler } from "./auth/google";
import { mqttCredentialHandler } from "./auth/mqtt";

const app = express();
app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

// ── JWKS (broker + any verifier fetches public keys here) ────────────────────
app.get("/.well-known/jwks.json", jwksHandler);

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post("/auth/login", loginHandler);
app.post("/auth/google", googleHandler);
app.post("/auth/refresh", refreshHandler);
app.post("/auth/mqtt-credential", requireAuth("genyx-api"), mqttCredentialHandler);

// ── Dev-only: mint a test JWT for broker acceptance tests ─────────────────────
// Usage: POST /_dev/mint-test-jwt  { scope: "user"|"edge", sub: "test_user" }
if (process.env.NODE_ENV !== "production") {
  app.post("/_dev/mint-test-jwt", async (req, res) => {
    const { scope = "user", sub = "dev_user", aud = "mqtt" } = req.body as {
      scope?: string;
      sub?: string;
      aud?: string;
    };
    try {
      const tok = await sign({ sub, scope }, 60 * 60, aud);
      res.json({ token: tok, sub, scope, aud });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "4000", 10);

keysReady
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Genyx auth-svc running on :${PORT}`);
      console.log(`   JWKS → http://localhost:${PORT}/.well-known/jwks.json`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to load RS256 keys:", err.message);
    process.exit(1);
  });
