"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/lib/auth-client";

export function SignupForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const form = e.currentTarget;
    const firstName = (form.elements.namedItem("firstName") as HTMLInputElement).value.trim();
    const lastName  = (form.elements.namedItem("lastName")  as HTMLInputElement).value.trim();
    const email     = (form.elements.namedItem("email")     as HTMLInputElement).value.trim();
    const password  = (form.elements.namedItem("password")  as HTMLInputElement).value;

    const { error: authError } = await signUp.email({
      email,
      password,
      name: `${firstName} ${lastName}`.trim(),

      callbackURL: "/dashboard",
    });

    if (authError) {
      setError(authError.message ?? "Something went wrong. Please try again.");
      setIsPending(false);
      return;
    }

    const params = new URLSearchParams({
      email,
      password,
    });
    window.location.href = `/verify-email?${params.toString()}`;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder="Jane"
            autoComplete="given-name"
            required
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder="Smith"
            autoComplete="family-name"
            required
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Min. 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="mt-1 w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
