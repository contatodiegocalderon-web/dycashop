import { NextRequest, NextResponse } from "next/server";
import { resolveActiveDropMember } from "@/lib/drop-member-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const member = await resolveActiveDropMember(request);
  if (!member) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      email: member.email,
      fullName: member.fullName,
      memberId: member.memberId,
    },
  });
}
