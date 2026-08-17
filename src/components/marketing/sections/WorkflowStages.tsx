"use client";

import { motion } from "framer-motion";
import { CheckCircle2, MessageSquare, Users, Wand2 } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";

const STAGES = [
  { number: "01", title: "Create", description: "AI-assisted creation and editing", icon: Wand2 },
  { number: "02", title: "Review", description: "Frame-level feedback and annotations", icon: MessageSquare },
  { number: "03", title: "Collaborate", description: "Tasks, versions and team feedback", icon: Users },
  { number: "04", title: "Approve", description: "Review, approval and final delivery", icon: CheckCircle2 },
];

/** The hero's video-frame story continues here as a concrete 4-stage workflow — same visual language (navy cards, indigo/teal accents), tying the "AI Video Lab" hero to the real product flow. */
export function WorkflowStages() {
  return (
    <SectionWrapper id="workflow" className="max-w-5xl">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">The Omtatva Workflow</p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">One creative workflow. From first frame to final approval.</h2>
      </div>

      <div className="relative mt-16">
        <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent sm:block" aria-hidden="true" />
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-4 sm:gap-6">
          {STAGES.map((stage, index) => (
            <motion.div
              key={stage.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: index * 0.12 }}
              className="relative flex flex-col items-center text-center sm:items-start sm:text-left"
            >
              <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-cards text-primary shadow-soft">
                <stage.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-mono font-semibold text-foreground-muted">{stage.number}</p>
              <h3 className="mt-1 text-base font-semibold text-foreground">{stage.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground-muted">{stage.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
