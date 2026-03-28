import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { MeetApollo } from "@/components/landing/MeetApollo";
import { Navbar } from "@/components/landing/Navbar";

export const metadata = {
  title: "Avenire",
  description:
    "An interactive AI reasoning and research workspace. Break down complex ideas, learn interactively, and build genuine understanding.",
};

export default function Page() {
  return (
    <main className="landing-light-scope min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <HowItWorks />
      <MeetApollo />
      <CTA />
      <Footer />
    </main>
  );
}
