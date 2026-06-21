import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function sign(payload: { id: number; email: string }): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function userFromRequest(req: NextRequest): { id: number; email: string } | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), SECRET) as { id: number; email: string };
  } catch {
    return null;
  }
}
