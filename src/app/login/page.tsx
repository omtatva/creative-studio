"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { loginSchema, type LoginFormValues } from "@/lib/validations/auth.schema";
import { ROUTES } from "@/lib/constants/routes";

export default function LoginPage() {
  const { login, isSubmitting, error } = useAuth();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const explicitRedirect = searchParams.get("redirect");
  // Mirrors signup/page.tsx: a plan picked on /pricing survives a
  // direct /login?plan=pro visit the same way it survives signup.
  const redirectTo = explicitRedirect || (planParam ? `${ROUTES.workspaceCreate}?plan=${encodeURIComponent(planParam)}` : undefined);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue to your workspace">
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => login(values, redirectTo))}>
          <Input label="Email" type="email" placeholder="you@company.com" error={errors.email?.message} {...register("email")} />
          <Input label="Password" type="password" placeholder="••••••••" error={errors.password?.message} {...register("password")} />

          <div className="-mt-2 flex justify-end">
            <Link href={ROUTES.forgotPassword} className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button type="submit" isLoading={isSubmitting} className="mt-1 w-full">
            Log in
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        Don&apos;t have an account?{" "}
        <Link
          href={redirectTo ? `${ROUTES.signup}?redirect=${encodeURIComponent(redirectTo)}` : ROUTES.signup}
          className="font-medium text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
