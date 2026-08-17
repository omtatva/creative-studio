"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { SectionWrapper } from "../SectionWrapper";

export function FinalCta() {
  const router = useRouter();

  return (
    <SectionWrapper id="final-cta" className="max-w-3xl text-center">
      <h2 className="text-4xl font-semibold text-foreground sm:text-5xl">Let&apos;s build what&apos;s next.</h2>
      <p className="mx-auto mt-5 max-w-lg text-base text-foreground-muted sm:text-lg">
        Bring your team, your projects and your creative process into one connected workspace.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" onClick={() => router.push(ROUTES.signup)}>
          Start Creating
        </Button>
        <Button size="lg" variant="outline" onClick={() => router.push(ROUTES.login)}>
          Sign In
        </Button>
      </div>
    </SectionWrapper>
  );
}
