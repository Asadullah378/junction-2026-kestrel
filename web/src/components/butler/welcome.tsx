"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, AudioLines, BadgeEuro, Eye, ListChecks, MapPinned, Microscope, Newspaper } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { useClientValue } from "@/lib/use-client";
import { voiceSupported } from "@/lib/voice/audio";

type Preset = { icon: React.ReactNode; title: string; hint: string; prompt: (place: string) => string };

const city = (place: string) => place.split(",")[0]?.trim() || "Helsinki";

/** One-tap real cases. Each one exercises a different card, and all of them need the web as it is now. */
const PRESETS: Preset[] = [
  {
    icon: <Eye />,
    title: "Watch a price",
    hint: "Seven countries, told when it drops",
    prompt: () => "What does the Sony WH-1000XM6 cost across Europe right now? Then watch it and tell me when the price drops anywhere.",
  },
  {
    icon: <ListChecks />,
    title: "Find the ones that fit",
    hint: "Forty pages, every wish checked",
    prompt: () => "Find chickpea dinner recipes that take under 30 minutes, have no meat or fish, no nuts, and cook in one pan.",
  },
  {
    icon: <BadgeEuro />,
    title: "Where is it cheapest",
    hint: "One product, priced by country",
    prompt: () => "Where in Europe is the Nintendo Switch 2 cheapest today, and how much more is it here?",
  },
  {
    icon: <MapPinned />,
    title: "Plan a dinner",
    hint: "Places, opening hours, the weather",
    prompt: (p) => `Find a cosy restaurant with good vegan options in central ${city(p)} for Saturday evening, and check the weather for the walk there.`,
  },
  {
    icon: <Newspaper />,
    title: "What is new",
    hint: "The latest, with dates and sources",
    prompt: () => "What is the latest news on the EU AI Act? Give me the dates that matter.",
  },
  {
    icon: <Microscope />,
    title: "Research a decision",
    hint: "A full report with sources",
    prompt: () => "I moved to Finland as a non-EU master's student in August 2024 and work part-time. Which rule changes since then affect me, and what should I do about each?",
  },
];

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Welcome({ place, onPick, onTalk }: { place: string; onPick: (prompt: string) => void; /** Start a live call. */ onTalk?: () => void }) {
  const canTalk = useClientValue(voiceSupported, false) && Boolean(onTalk);
  // The hour is only known in the browser, so the greeting appears after hydration.
  const hour = useClientValue(() => new Date().getHours(), -1);
  const hello = hour >= 0 ? greeting(hour) : null;
  const presets = PRESETS;

  return (
    // Sized to the chat column: beside the live browser it is narrow even on a wide screen.
    <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 pt-[6vh] pb-6 @min-[440px]/chat:pt-[8vh] @min-[640px]/chat:pt-[12vh]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
        <p className="text-[0.74rem] font-medium tracking-[0.14em] text-brand uppercase @min-[440px]/chat:text-[0.8rem]">{APP_NAME} watches the web for you</p>
        <h1 className="font-display mt-3 text-[1.8rem] leading-[1.12] text-balance @min-[440px]/chat:text-[2.25rem] @min-[640px]/chat:text-[2.9rem] @min-[640px]/chat:leading-[1.1]">
          <span className={hello ? "opacity-100 transition-opacity duration-500" : "opacity-0"}>{hello ?? "Good evening"}.</span>
          <br />
          <span className="text-muted-foreground">What should I keep an eye on?</span>
        </h1>
        <p className="mt-4 max-w-[34rem] text-[0.9rem] leading-relaxed text-muted-foreground @min-[440px]/chat:mt-5 @min-[440px]/chat:text-[0.95rem]">
          Ask once. I search the live web, read the pages and check them against what you asked for. Say “watch it” and I keep looking, and tell you when something changes.
        </p>
        {canTalk ? (
          <button
            type="button"
            onClick={onTalk}
            className="mt-5 flex h-11 items-center gap-2.5 rounded-full bg-primary pr-5 pl-4 text-[0.92rem] font-medium text-primary-foreground shadow-card transition-[transform,opacity] hover:opacity-90 active:scale-[0.98]"
          >
            <AudioLines className="size-[1.15rem]" />
            Talk to {APP_NAME}
          </button>
        ) : null}
      </motion.div>

      {/* Narrow column: two columns of small chips, name only. Wider: tiles with a line of explanation, two then three across. */}
      <div className="mt-6 grid grid-cols-2 gap-2 @min-[440px]/chat:mt-9 @min-[440px]/chat:gap-2.5 @min-[640px]/chat:mt-11 @min-[640px]/chat:grid-cols-3">
        {presets.map((preset, i) => (
          <motion.button
            key={preset.title}
            type="button"
            title={preset.hint}
            onClick={() => onPick(preset.prompt(place))}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 + i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
            className="group/preset relative flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card/70 p-2.5 text-left shadow-card backdrop-blur-sm transition-[border-color,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-ring/50 hover:bg-card @min-[440px]/chat:flex-col @min-[440px]/chat:items-start @min-[440px]/chat:gap-2 @min-[440px]/chat:rounded-2xl @min-[440px]/chat:p-4"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand @min-[440px]/chat:size-8 [&_svg]:size-4">{preset.icon}</span>
            <span className="min-w-0 text-[0.84rem] leading-tight font-medium tracking-tight @min-[440px]/chat:text-[0.95rem] @min-[440px]/chat:leading-normal">{preset.title}</span>
            <span className="hidden text-[0.8rem] leading-snug text-muted-foreground @min-[440px]/chat:block">{preset.hint}</span>
            <ArrowUpRight className="absolute top-4 right-4 hidden size-4 text-subtle opacity-0 transition-[opacity,transform] duration-200 group-hover/preset:translate-x-0.5 group-hover/preset:-translate-y-0.5 group-hover/preset:opacity-100 @min-[440px]/chat:block" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
