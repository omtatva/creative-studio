"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { forgotPasswordSchema, type ForgotPasswordFormValues } from "@/lib/validations/auth.schema";
import { ROUTES } from "@/lib/constants/routes";

export default function ForgotPasswordPage() {
  const { forgotPassword, isSubmitting, error } = useAuth();
  const [isSent, setIsSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordFormValues) {
    const success = await forgotPassword(values.email);
    if (success) setIsSent(true);
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to reset it">
      <Card>
        {isSent ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-foreground">Check your inbox</p>
            <p className="text-xs text-foreground-muted">We&apos;ve sent a password reset link to your email.</p>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
            <Input label="Email" type="email" placeholder="you@company.com" error={errors.email?.message} {...register("email")} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" isLoading={isSubmitting} className="mt-1 w-full">
              Send reset link
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        Remembered it?{" "}
        <Link href={ROUTES.login} className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
