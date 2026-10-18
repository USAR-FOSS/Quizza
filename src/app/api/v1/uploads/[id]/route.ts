import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploads } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return new Response(null, { status: 404 });
  const [asset] = await db
    .select({ data: uploads.data, contentType: uploads.contentType })
    .from(uploads)
    .where(eq(uploads.id, id))
    .limit(1);
  if (!asset) return new Response(null, { status: 404 });
  return new Response(Buffer.from(asset.data, "base64"), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
