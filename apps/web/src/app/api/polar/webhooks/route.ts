import { handlePolarWebhook } from "@avenire/payments";
import { NextRequest, NextResponse } from "next/server";
import { applyPolarWebhookEvent } from "@/lib/billing";
import { createApiLogger } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  const apiLogger = createApiLogger({
    request,
    route: "/api/polar/webhooks",
    feature: "payments",
  });
  const requestId = apiLogger.requestId;

  try {
    void apiLogger.requestStarted({
      hasSecret: Boolean(secret),
    });
    console.info("[api/polar/webhooks] incoming request", {
      requestId,
      hasSecret: Boolean(secret),
      userAgent: request.headers.get("user-agent") ?? null,
      forwardedFor: request.headers.get("x-forwarded-for") ?? null,
    });

    if (!secret) {
      console.error("[api/polar/webhooks] POLAR_WEBHOOK_SECRET is missing");
      void apiLogger.requestFailed(503, "Webhook secret not configured");
      return NextResponse.json(
        {
          ok: false,
          error: "Webhook secret not configured",
        },
        { status: 503 },
      );
    }

    const payload = await request.text();
    const event = await handlePolarWebhook(payload, request.headers.get("polar-signature"));
    if (!event) {
      console.error("[api/polar/webhooks] signature verification failed", {
        requestId,
      });
      void apiLogger.requestFailed(400, "Invalid webhook signature");
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid webhook signature",
        },
        { status: 400 },
      );
    }

    console.info("[api/polar/webhooks] verified event", {
      requestId,
      type: (event as { type?: string }).type ?? null,
    });
    void apiLogger.meter("meter.billing.webhook.processed", {
      eventType: (event as { type?: string }).type ?? null,
      status: "verified",
    });
    void apiLogger.featureUsed("payments.webhook", {
      eventType: (event as { type?: string }).type ?? null,
    });
    await applyPolarWebhookEvent(event as { type: string; data?: Record<string, unknown> });
    void apiLogger.requestSucceeded(200);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/polar/webhooks] failed", { requestId, error });
    void apiLogger.requestFailed(500, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
