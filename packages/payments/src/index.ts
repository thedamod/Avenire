import { Polar } from "@polar-sh/sdk";
import { WebhookVerificationError, validateEvent } from "@polar-sh/sdk/webhooks";

type PolarServer = "sandbox" | "production";

function getPolarServer(): PolarServer {
  const configured = process.env.POLAR_SERVER;
  if (configured === "sandbox" || configured === "production") {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
}

function getPolarAccessToken() {
  const raw = process.env.POLAR_ACCESS_TOKEN ?? "";
  const token = raw.trim().replace(/^['"]|['"]$/g, "");

  if (!token) {
    throw new Error("Missing POLAR_ACCESS_TOKEN");
  }

  return token;
}

function getPolarClient() {
  return new Polar({
    accessToken: getPolarAccessToken(),
    server: getPolarServer(),
  });
}

export type PaidPlan = "core" | "scholar";
export type BillingPeriod = "monthly" | "yearly";

function getProductId(plan: PaidPlan, billing: BillingPeriod) {
  const key = `${plan}_${billing}` as const;
  const productIds: Record<typeof key, string | undefined> = {
    core_monthly: process.env.POLAR_PRODUCT_ID_CORE_MONTHLY,
    core_yearly: process.env.POLAR_PRODUCT_ID_CORE_YEARLY,
    scholar_monthly: process.env.POLAR_PRODUCT_ID_SCHOLAR_MONTHLY,
    scholar_yearly: process.env.POLAR_PRODUCT_ID_SCHOLAR_YEARLY,
  };

  return productIds[key] ?? "";
}

export function mapProductIdToPlan(productId?: string | null): PaidPlan | null {
  if (!productId) {
    return null;
  }

  const planByProduct = new Map<string, PaidPlan>();
  const mappings: Array<{ plan: PaidPlan; billing: BillingPeriod }> = [
    { plan: "core", billing: "monthly" },
    { plan: "core", billing: "yearly" },
    { plan: "scholar", billing: "monthly" },
    { plan: "scholar", billing: "yearly" },
  ];

  for (const mapping of mappings) {
    const mappedProduct = getProductId(mapping.plan, mapping.billing);
    if (mappedProduct) {
      planByProduct.set(mappedProduct, mapping.plan);
    }
  }

  return planByProduct.get(productId) ?? null;
}

export async function validatePolarWebhook(
  payload: string,
  headers: Record<string, string>,
) {
  return handlePolarWebhook(
    payload,
    headers["polar-signature"] ?? headers["Polar-Signature"] ?? null,
  );
}

export async function handlePolarWebhook(
  payload: string,
  signatureHeader: string | null | undefined,
) {
  const secret = (process.env.POLAR_WEBHOOK_SECRET ?? "").trim();
  const signature = signatureHeader?.trim();

  if (!secret || !signature) {
    return null;
  }

  try {
    return validateEvent(payload, { "polar-signature": signature }, secret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return null;
    }
    throw error;
  }
}

export async function createCustomerPortalLink(customerId: string, returnUrl?: string) {
  const polar = getPolarClient();
  return polar.customerSessions.create({
    customerId,
    returnUrl: returnUrl ?? null,
  });
}

export async function createCheckoutSession(input: {
  plan: PaidPlan;
  billing: BillingPeriod;
  userId: string;
  email: string;
  successUrl: string;
  returnUrl: string;
}) {
  const polar = getPolarClient();
  const productId = getProductId(input.plan, input.billing);
  if (!productId) {
    throw new Error(`Missing Polar product id for ${input.plan}/${input.billing}`);
  }

  try {
    return await polar.checkouts.create({
      products: [productId],
      externalCustomerId: input.userId,
      customerEmail: input.email,
      metadata: {
        userId: input.userId,
        plan: input.plan,
        billing: input.billing,
      },
      successUrl: input.successUrl,
      returnUrl: input.returnUrl,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 401
    ) {
      throw new Error(
        `Polar authentication failed (401). Check POLAR_ACCESS_TOKEN and POLAR_SERVER (${getPolarServer()}).`
      );
    }
    throw error;
  }
}
