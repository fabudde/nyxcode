// app/api/posts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const posts = await prisma.post.findMany({
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const user = verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "No token provided" }, { status: 401 });
  }

  const { title, body, author } = await req.json();

  if (!title || !body) {
    return NextResponse.json(
      { error: "title and body required" },
      { status: 400 }
    );
  }

  try {
    const post = await prisma.post.create({
      data: { title, body, authorId: author || user.id },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json(post, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
