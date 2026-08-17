"use client";

import { motion } from "framer-motion";
import { Clapperboard, Cpu, Layers, Sparkles } from "lucide-react";
import { SectionWrapper } from "../SectionWrapper";

const CARDS = [
  { icon: Clapperboard, title: "Creative Production", description: "Video, design and content pipelines built for teams that ship fast without losing quality." },
  { icon: Cpu, title: "AI & Automation", description: "Workflow tooling that removes repetitive work so creative time stays creative." },
  { icon: Layers, title: "Digital Experiences", description: "Web, product and interactive experiences designed to feel considered, not templated." },
  { icon: Sparkles, title: "Technology", description: "A modern engineering foundation — real-time collaboration, versioning and review, built in." },
];

export function WhatWeCreate() {
  return (
    <SectionWrapper id="what-we-create">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">What We Create</p>
        <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">Four disciplines, one studio.</h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <motion.div
            key={card.title}
            whileHover={{ y: -6, rotateX: 2, rotateY: -2 }}
            style={{ transformPerspective: 800 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="rounded-theme border border-border/60 bg-cards/60 p-6 shadow-soft backdrop-blur-glass transition-colors duration-200 hover:border-primary/30"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-theme bg-primary/10 text-primary">
              <card.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{card.description}</p>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
