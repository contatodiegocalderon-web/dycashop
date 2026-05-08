import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

const LOGO_PATH =
  "C:\\Users\\digdi\\.cursor\\projects\\c-Users-digdi-OneDrive-rea-de-Trabalho\\assets\\c__Users_digdi_AppData_Roaming_Cursor_User_workspaceStorage_f5450bf75dca50e27df0340af9850234_images_66170adfa55fb-f204a0b3-d88f-4000-a63b-d166d7244290.png";

export async function GET() {
  try {
    const file = await readFile(LOGO_PATH);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo não encontrado." }, { status: 404 });
  }
}
