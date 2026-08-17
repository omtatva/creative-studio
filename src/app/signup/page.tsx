"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { signupSchema, type SignupFormValues } from "@/lib/validations/auth.schema";
import { ROUTES } from "@/lib/constants/routes";

function SignupPageContent() {
  const { signup, isSubmitting, error } = useAuth();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const explicitRedirect = searchParams.get("redirect");
  // A plan picked on /pricing (?plan=pro) rides through signup as a
  // redirect target to workspace/create?plan=pro, which reads it and
  // passes it into createWorkspace() — see workspace/create/page.tsx.
  // An explicit ?redirect= (e.g. an invite link) always wins since
  // that flow doesn't go through workspace creation at all.
  const redirectTo = explicitRedirect || (planParam ? `${ROUTES.workspaceCreate}?plan=${encodeURIComponent(planParam)}` : undefined);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  return (
    <AuthLayout title="Create your account" subtitle="Start managing creative work in minutes">
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit(({ confirmPassword: _confirmPassword, ...payload }) => signup(payload, redirectTo))}
        >
          <Input label="Full name" placeholder="Jane Doe" error={errors.displayName?.message} {...register("displayName")} />
          <Input label="Email" type="email" placeholder="you@company.com" error={errors.email?.message} {...register("email")} />
          <Input label="Password" type="password" placeholder="At least 8 characters" error={errors.password?.message} {...register("password")} />
          <Input label="Confirm password" type="password" placeholder="Repeat your password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" isLoading={isSubmitting} className="mt-1 w-full">
            Create account
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link
          href={redirectTo ? `${ROUTES.login}?redirect=${encodeURIComponent(redirectTo)}` : ROUTES.login}
          className="font-medium text-primary hover:underline"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
