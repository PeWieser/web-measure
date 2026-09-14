import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      width: projects.width,
      height: projects.height,
      mime: projects.mime,
      size: projects.size,
      data: projects.data,
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { name?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) set.name = body.name.trim();
  if (body.data && typeof body.data === "object") set.data = body.data;
  const rows = await db
    .update(projects)
    .set(set)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
