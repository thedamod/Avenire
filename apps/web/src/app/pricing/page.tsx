import { PricingPageClient } from "@/components/landing/pricing-page-client";
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata = buildPageMetadata({
  title: "Pricing",
});

export default function PricingPage() {
  return <PricingPageClient />;
}
