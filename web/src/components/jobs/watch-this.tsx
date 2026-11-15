"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Eye, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { watchThis } from "@/lib/jobs/client";

/*
 * "Watch this", on a card that found things: keep looking for the same thing and tell me when
 * something changes. One press makes the watch, with what the card was looking for; its first
 * look starts at once and the card then links to it.
 */
export function WatchThis({ title, spec, className }: { title: string; spec: unknown; className?: string }) {
  const [state, setState] = React.useState<"idle" | "busy" | { id: string }>("idle");

  if (typeof state === "object") {
    return (
      <Link
        href={`/watches?job=${encodeURIComponent(state.id)}`}
        className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-[0.75rem] font-medium whitespace-nowrap text-brand transition-opacity hover:opacity-85", className)}
      >
        <Check className="size-3.5" strokeWidth={2.5} />
        Watching
      </Link>
    );
  }

  const press = async () => {
    setState("busy");
    const answer = await watchThis({ title: title || "Watch", spec });
    if (!answer.ok) {
      setState("idle");
      toast.error(answer.problem);
      return;
    }
    setState({ id: answer.value.id });
    toast.success("Watching", { description: "It looks again every hour and tells you only when something changes." });
  };

  return (
    <button
      type="button"
      onClick={() => void press()}
      disabled={state === "busy"}
      title="Keep looking for this and tell me when something changes"
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[0.75rem] font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60",
        className,
      )}
    >
      {state === "busy" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
      Watch this
    </button>
  );
}
