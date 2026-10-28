"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { registerAction, signInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
const registerSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

type SignInValues = z.infer<typeof signInSchema>;

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

function CredentialsForm({ mode, next }: { mode: "signin" | "register"; next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInValues>({
    resolver: zodResolver(mode === "signin" ? signInSchema : registerSchema),
    defaultValues: { email: "", password: "" },
  });
  const prefix = mode === "signin" ? "signin" : "register";

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "signin" ? await signInAction({ ...values, next }) : await registerAction(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(result.data.redirectTo);
      router.refresh();
    });
  });

  const { errors } = form.formState;
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-email`}>Email</Label>
        <Input
          id={`${prefix}-email`}
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${prefix}-email-error` : undefined}
          {...form.register("email")}
        />
        <FieldError id={`${prefix}-email-error`} message={errors.email?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-password`}>Password</Label>
        <Input
          id={`${prefix}-password`}
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? `${prefix}-password-error` : undefined}
          {...form.register("password")}
        />
        <FieldError id={`${prefix}-password-error`} message={errors.password?.message} />
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}

export function LoginForm({
  registrationEnabled,
  next,
}: {
  registrationEnabled: boolean;
  next?: string;
}) {
  if (!registrationEnabled) return <CredentialsForm mode="signin" next={next} />;
  return (
    <Tabs defaultValue="signin" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign in</TabsTrigger>
        <TabsTrigger value="register">Create account</TabsTrigger>
      </TabsList>
      <TabsContent value="signin">
        <CredentialsForm mode="signin" next={next} />
      </TabsContent>
      <TabsContent value="register">
        <CredentialsForm mode="register" />
      </TabsContent>
    </Tabs>
  );
}
