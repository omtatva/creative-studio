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
 * Public marketing landing page — the whole tree is wrapped in a
 * locally-forced `.dark` scope so it always reads as the intended
 * cinematic dark palette regardless of the visitor's OS preference,
 * without touching ThemeContext/global theme state at all (a
 * logged-out visitor has no workspace, so ThemeContext already sits
 * on DEFAULT_THEME — this class just wins the same `.dark` CSS rules
 * already defined in globals.css for this subtree).
 */
export function LandingPage() {
  return (
    <div className="dark bg-background text-foreground">
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
