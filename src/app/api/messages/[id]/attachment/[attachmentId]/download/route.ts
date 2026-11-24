import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { downloadMessageAttachment } from "@/lib/messages/service";

// GET /api/messages/[id]/attachment/[attachmentId]/download
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    const result = await downloadMessageAttachment(id, attachmentId, user);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error || "Access Denied" },
        { status: result.statusCode || 403 }
      );
    }

    const { fileBuffer, fileName, mimeType } = result.data;

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error) {
    console.error("[ATTACHMENT DOWNLOAD ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Zero-Trust: Unable to download attachment" },
      { status: 500 }
    );
  }
}
