import { cn } from "@/lib/utils";

/*
 * The frames the landing page puts its pictures in, drawn in CSS: a browser window, a plain
 * window with a title, and a phone. What goes inside is drawn by the page itself, so it follows
 * the theme.
 */

const Dots = () => (
  <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span key={i} className="size-2.5 rounded-full bg-foreground/15" />
    ))}
  </span>
);

const WINDOW = "overflow-hidden rounded-2xl border border-border bg-card shadow-float";

/** A browser window: three dots and an address bar. */
export function BrowserFrame({ address, children, className }: { /** What the address bar says. */ address?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(WINDOW, className)}>
      <div className="flex h-9 items-center gap-3 border-b border-border bg-muted/60 px-3.5 sm:h-10">
        <Dots />
        <span className="flex h-5 min-w-0 flex-1 items-center justify-center truncate rounded-full bg-background/80 px-3 text-[0.68rem] text-subtle sm:mx-auto sm:h-6 sm:max-w-[22rem]" aria-hidden>
          {address}
        </span>
        <span className="hidden w-[2.6rem] sm:block" aria-hidden />
      </div>
      {children}
    </div>
  );
}

/** A plain window: a title bar with a name. */
export function WindowFrame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(WINDOW, className)}>
      <div className="relative flex h-9 items-center border-b border-border bg-muted/60 px-3.5 sm:h-10">
        <Dots />
        <span className="absolute inset-x-0 text-center text-[0.72rem] font-medium text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * A phone. Everything is sized from the frame's own width (container units), so it keeps its
 * proportions at any size. The screen has a status bar and a home bar of its own, in the app's
 * background colour: what is shown sits between them, away from the rounded corners.
 */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("[container-type:inline-size]", className)}>
      <div className="rounded-[15cqw] bg-[oklch(0.24_0.03_262)] p-[2.6cqw] shadow-float ring-1 ring-foreground/10 dark:bg-[oklch(0.33_0.035_262)]">
        <div className="overflow-hidden rounded-[12.6cqw] bg-background">
          <div className="relative flex h-[9.5cqw] items-end justify-between px-[8cqw] pb-[1.2cqw] text-[3.3cqw] leading-none font-semibold text-foreground/80" aria-hidden>
            <span className="nums">9:41</span>
            <span className="absolute top-[2.4cqw] left-1/2 h-[5.4cqw] w-[23cqw] -translate-x-1/2 rounded-full bg-[oklch(0.15_0.03_262)]" />
            <span className="flex items-center gap-[1.2cqw]">
              <span className="flex items-end gap-[0.5cqw]">
                {[1.4, 2, 2.6, 3.2].map((h) => (
                  <span key={h} className="w-[0.75cqw] rounded-full bg-current" style={{ height: `${h}cqw` }} />
                ))}
              </span>
              <span className="relative h-[2.9cqw] w-[5.6cqw] rounded-[0.9cqw] border border-current/60">
                <span className="absolute inset-[0.35cqw] right-[1.2cqw] rounded-[0.4cqw] bg-current" />
              </span>
            </span>
          </div>
          {children}
          <div className="flex h-[6cqw] items-center justify-center" aria-hidden>
            <span className="h-[1.15cqw] w-[32cqw] rounded-full bg-foreground/35" />
          </div>
        </div>
      </div>
    </div>
  );
}
