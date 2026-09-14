import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      width: projects.width,
      height: projects.height,
      size: projects.size,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "Unbenanntes Projekt";
  const width = parseInt(url.searchParams.get("w") || "0", 10);
  const height = parseInt(url.searchParams.get("h") || "0", 10);
  if (!width || !height) {
    return NextResponse.json({ error: "Breite und Höhe fehlen" }, { status: 400 });
  }
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "Leere Bilddaten" }, { status: 400 });
  }
  if (buf.byteLength > 80 * 1024 * 1024) {
    return NextResponse.json({ error: "Bild ist zu groß (max. 80 MB)" }, { status: 413 });
  }
  const b64 = Buffer.from(buf).toString("base64");
  const mime = req.headers.get("content-type") || "image/png";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  const [row] = await db
    .insert(projects)
    .values({
      id,
      name,
      width,
      height,
      mime,
      size: buf.byteLength,
      image: b64,
      data: {},
    })
    .returning({ id: projects.id });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
