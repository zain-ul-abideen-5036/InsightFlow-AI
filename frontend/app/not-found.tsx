import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size="lg" />
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">We could not find that page</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The link may be out of date, or the page may have moved.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/overview">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
