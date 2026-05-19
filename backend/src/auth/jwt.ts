/**
 * auth/jwt.ts — RS256 sign + verify + JWKS export
 *
 * Uses the `jose` library (ESM-compatible via commonjs via esModuleInterop).
 * Keys are loaded from PEM files at startup.
 */

import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  type JWTPayload,
} from "jose";
import fs from "fs";
import { Request, Response, NextFunction } from "express";

const ISS = process.env.JWT_ISS || "https://auth.genyx.local";
const KID = process.env.JWT_KID || "genyx-2026-05";

const privatePemPath =
  process.env.JWT_PRIVATE_KEY_PATH || "/keys/jwt-private.pem";
const publicPemPath =
  process.env.JWT_PUBLIC_KEY_PATH || "/keys/jwt-public.pem";

const privatePem = fs.readFileSync(privatePemPath, "utf8");
const publicPem = fs.readFileSync(publicPemPath, "utf8");

// Eagerly import keys (top-level await via immediately-invoked async module pattern)
let privateKey: CryptoKey;
let publicKey: CryptoKey;

async function loadKeys() {
  privateKey = await importPKCS8(privatePem, "RS256");
  publicKey = await importSPKI(publicPem, "RS256");
}

// Export the init promise so index.ts can await it before starting the server
export const keysReady = loadKeys();

// ── JWKS endpoint helper ──────────────────────────────────────────────────────

export async function jwks(): Promise<{ keys: object[] }> {
  await keysReady;
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid: KID,
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

// ── Token mint ────────────────────────────────────────────────────────────────

export interface ExtraClaims {
  [key: string]: unknown;
}

export async function sign(
  claims: ExtraClaims,
  ttlSec: number,
  aud: string
): Promise<string> {
  await keysReady;
  return await new SignJWT(claims as JWTPayload)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(ISS)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(privateKey);
}

// ── Token verify ──────────────────────────────────────────────────────────────

export async function verify(token: string, aud: string): Promise<JWTPayload> {
  await keysReady;
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISS,
    audience: aud,
  });
  return payload;
}

// ── Express middleware ────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export function requireAuth(aud = "genyx-api") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const h = req.headers.authorization || "";
      const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
      if (!tok) throw new Error("no token");
      req.user = await verify(tok, aud);
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
