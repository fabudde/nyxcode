// lib/auth.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

interface AuthUser {
  id: number;
  email: string;
}

export function verifyAuth(req: NextRequest): AuthUser | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}
