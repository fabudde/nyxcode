// app/api/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const comments = await prisma.comment.findMany({
    include: {
      post: { select: { id: true, title: true, body: true, createdAt: true } },
      author: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(comments);
}

export async function POST(req: NextRequest) {
  const user = verifyAuth(req);
  if (!user) {
    return NextResponse.json({ error: "No token provided" }, { status: 401 });
  }

  const { body, post, author } = await req.json();

  if (!body || !post) {
    return NextResponse.json(
      { error: "body and post required" },
      { status: 400 }
    );
  }

  try {
    const comment = await prisma.comment.create({
      data: { body, postId: post, authorId: author || user.id },
      include: {
        post: { select: { id: true, title: true, body: true, createdAt: true } },
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
