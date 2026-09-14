import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const rows = await db
    .select({ image: projects.image, mime: projects.mime })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });
  const buf = Buffer.from(row.image, "base64");
  return new Response(buf, {
    headers: {
      "Content-Type": row.mime || "image/png",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
