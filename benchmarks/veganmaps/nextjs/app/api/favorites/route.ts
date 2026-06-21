import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { userFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const u = userFromRequest(req);
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = db.prepare('SELECT id, name, lat, lon FROM favorites WHERE user = ?').all(u.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const u = userFromRequest(req);
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, lat, lon } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const info = db
    .prepare('INSERT INTO favorites (user, name, lat, lon) VALUES (?, ?, ?, ?)')
    .run(u.id, name, lat, lon);
  return NextResponse.json({ id: Number(info.lastInsertRowid), name, lat, lon });
}
