import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { PricingSection } from "@/components/marketing/sections/PricingSection";

/** Standalone public route, same light/warm chrome as the homepage — see LandingPage.tsx. */
export default function PricingPage() {
  return (
    <div className="bg-background text-foreground">
      <Navbar />
      <main className="pt-16">
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
