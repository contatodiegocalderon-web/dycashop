import { NextRequest, NextResponse } from "next/server";
import { apiKeyMatches, resolvePrincipal } from "@/lib/access";

export async function GET(request: NextRequest) {
  if (apiKeyMatches(request)) {
    return NextResponse.json({
      user: {
        role: "owner" as const,
        email: "api-key",
        fromApiKey: true,
      },
    });
  }

  const p = await resolvePrincipal(request);
  if (!p || p.kind === "api_key") {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      email: p.staff.email,
      role: p.staff.role,
      staffId: p.staff.staffId,
      fromApiKey: false,
    },
  });
}
