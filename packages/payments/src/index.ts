import { Polar } from "@polar-sh/sdk";
import { WebhookVerificationError, validateEvent } from "@polar-sh/sdk/webhooks";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: process.env.NODE_ENV === "production" ? "production" : "sandbox"
});

export async function handlePolarWebhook(payload: string, signature: string) {
  const secret = process.env.POLAR_WEBHOOK_SECRET ?? "";

  if (!secret) {
    return false;
  }

  try {
    validateEvent(payload, { "polar-signature": signature }, secret);
    return true;
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return false;
    }
    throw error;
  }
}

export async function createCustomerPortalLink(customerId: string) {
  return polar.customerSessions.create({
    customerId
  });
}
