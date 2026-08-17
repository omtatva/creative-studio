"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SectionWrapperProps {
  id: string;
  className?: string;
  children: ReactNode;
}

/** Shared <section> shell every landing-page section uses — consistent width/padding and a one-time fade-up on scroll into view. */
export function SectionWrapper({ id, className, children }: SectionWrapperProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={cn("mx-auto w-full max-w-6xl px-6 py-20 sm:py-28", className)}
    >
      {children}
    </motion.section>
  );
}
