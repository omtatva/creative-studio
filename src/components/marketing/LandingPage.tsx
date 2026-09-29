import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { Hero } from "./hero/Hero";
import { WorkflowStages } from "./sections/WorkflowStages";
import { WhatWeCreate } from "./sections/WhatWeCreate";
import { OmtatvaAI } from "./sections/OmtatvaAI";
import { DigitalExperiences } from "./sections/DigitalExperiences";
import { CreativeCollaboration } from "./sections/CreativeCollaboration";
import { AIWorkspace } from "./sections/AIWorkspace";
import { FeaturedWork } from "./sections/FeaturedWork";
import { FinalCta } from "./sections/FinalCta";

/**
 * Public marketing landing page. Previously wrapped in a locally-
 * forced `.dark` scope so it always read as a cinematic dark palette
 * regardless of the visitor's OS preference — removed now that the
 * light, warm palette (DEFAULT_THEME.mode: "light") IS the intended
 * public identity, not a fallback. A logged-out visitor has no
 * workspace, so ThemeContext already sits on DEFAULT_THEME; this div
 * just needed its own background/text tokens (unchanged) since it
 * sits outside the authenticated shell.
 */
export function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <WorkflowStages />
        <WhatWeCreate />
        <OmtatvaAI />
        <DigitalExperiences />
        <CreativeCollaboration />
        <AIWorkspace />
        <FeaturedWork />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
