import { ShieldAlert } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">You don&apos;t have access to this</h1>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          Your role doesn&apos;t include permission for this screen. Ask a manager if you need it
          added to your account.
        </p>
      </div>
      <ButtonLink href="/">Back to my workspace</ButtonLink>
    </div>
  );
}
