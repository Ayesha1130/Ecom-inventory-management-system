import { AnnouncementBar } from "@/components/marketing/AnnouncementBar";
import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { ValueStrip } from "@/components/marketing/ValueStrip";
import { CatalogSection } from "@/components/marketing/CatalogSection";
import { InventorySection } from "@/components/marketing/InventorySection";
import { OrdersSection } from "@/components/marketing/OrdersSection";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { StorefrontSection } from "@/components/marketing/StorefrontSection";
import { AnalyticsSection } from "@/components/marketing/AnalyticsSection";
import { AutomationSection } from "@/components/marketing/AutomationSection";
import { Audience } from "@/components/marketing/Audience";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Footer } from "@/components/marketing/Footer";

export default function HomePage() {
  return (
    <>
      <AnnouncementBar />
      <Nav />
      <main>
        <Hero />
        <ValueStrip />
        <CatalogSection />
        <InventorySection />
        <OrdersSection />
        <StorefrontSection />
        <AnalyticsSection />
        <AutomationSection />
        <HowItWorks />
        <Audience />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
