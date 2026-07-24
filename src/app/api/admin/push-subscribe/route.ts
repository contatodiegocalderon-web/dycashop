import { NextRequest, NextResponse } from "next/server";
import { assertAdmin, resolvePrincipal } from "@/lib/admin-auth";
import { getVapidPublicKey } from "@/lib/admin-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** GET — chave pública VAPID para o browser subscrever. */
export async function GET(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      {
        error:
          "Push não configurado. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}

type PushSubBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/** POST — guarda subscription do dispositivo. */
export async function POST(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  try {
    const principal = await resolvePrincipal(request);
    const email =
      principal?.kind === "staff" ? principal.staff.email : null;

    const body = (await request.json()) as PushSubBody;
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const auth = String(body.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Subscription inválida." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.from("admin_push_subscriptions").upsert(
      {
        endpoint,
        p256dh,
        auth,
        staff_email: email,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}

/** DELETE — remove subscription (logout / revoke). */
export async function DELETE(request: NextRequest) {
  try {
    await assertAdmin(request);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não autorizado" },
      { status }
    );
  }

  try {
    const body = (await request.json()) as { endpoint?: string };
    const endpoint = String(body.endpoint ?? "").trim();
    if (!endpoint) {
      return NextResponse.json({ error: "Informe endpoint." }, { status: 400 });
    }
    const admin = createAdminClient();
    await admin
      .from("admin_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 400 }
    );
  }
}
