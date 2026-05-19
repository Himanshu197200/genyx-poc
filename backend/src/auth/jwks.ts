/**
 * auth/jwks.ts — GET /.well-known/jwks.json handler
 */

import { Request, Response } from "express";
import { jwks } from "./jwt";

export async function jwksHandler(_req: Request, res: Response) {
  try {
    const body = await jwks();
    res.set("Cache-Control", "public, max-age=300").json(body);
  } catch (err) {
    console.error("JWKS error:", err);
    res.status(500).json({ error: "jwks_unavailable" });
  }
}
