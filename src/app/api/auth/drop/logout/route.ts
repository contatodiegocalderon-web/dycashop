import { NextResponse } from "next/server";
import { DROP_MEMBER_COOKIE } from "@/lib/drop-member-access";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DROP_MEMBER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
