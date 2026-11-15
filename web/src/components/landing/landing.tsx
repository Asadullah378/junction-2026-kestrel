import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Bell,
  BellRing,
  Check,
  CircleHelp,
  Clock,
  CloudSun,
  FileX,
  Layers,
  Link2,
  ListFilter,
  Mail,
  MapPin,
  Play,
  Radar,
  Repeat,
  Scale,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Telescope,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { ModeIcon } from "@/components/butler/mode-icon";
import { BrowserFrame, PhoneFrame } from "./frames";
import { Live, type DemoName } from "./live";
import { DemoVideo, Drift, ModesDemo, Motion, Reveal, Rise, SignInLink, Stagger, StaggerItem, TopNav, VoiceBars } from "./parts";

/*
 * The front page of the website, for someone who is not signed in. It says what Kestrel does and
 * shows it. A watch is shown as a small drawing of the app's own screen (the pieces further down
 * this file), with a made-up store and made-up prices, and the page says so. The answers to
 * one-off questions are the app's own cards, running with sample data (live.tsx).
 *
 * The words are short on purpose: a headline, a line under it, one sentence per thing. The page
 * states no figures about speed or size: nothing here is a measurement.
 */

const MORE = ["Prices by country", "News", "Comparisons", "Timelines", "Opening hours", "Charts", "Job ads", "Recipes", "Courses"];

const ASKS = ["Tell me when any EU store sells these headphones under €300", "New junior, hybrid jobs in Helsinki that are fine with English", "Tell me when this pricing page changes"];

export function Landing({ signedIn = false, demoVideo = "" }: { signedIn?: boolean; /** A YouTube link or a video file's address. Empty until the film exists. */ demoVideo?: string }) {
  return (
    <Motion>
      <div id="top" className="landing min-h-dvh overflow-x-clip bg-background text-foreground">
        <TopNav signedIn={signedIn} />

        <main>
          {/* ───────── Hero ───────── */}
          <section className="backdrop-room">
            <div className="mx-auto w-full max-w-[1180px] px-5 pt-14 pb-16 sm:px-8 sm:pt-20 sm:pb-28">
              <div className="mx-auto max-w-[46rem] text-center">
                <Rise>
                  <p className="text-[0.78rem] font-medium tracking-[0.14em] text-brand uppercase">{APP_TAGLINE}</p>
                </Rise>
                <Rise delay={0.06}>
                  <h1 className="font-display mt-4 text-[3rem] leading-[1.02] text-balance sm:text-[4.6rem]">Tell it once. It keeps watching.</h1>
                </Rise>
                <Rise delay={0.12}>
                  <p className="mx-auto mt-5 max-w-[38rem] text-[1.08rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.2rem]">
                    {APP_NAME} searches the live web, reads the pages and checks each one against what you asked for. Then it keeps looking, and tells you when something changes.
                  </p>
                </Rise>
                <Rise delay={0.18} className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <SignInLink signedIn={signedIn} />
                  <a
                    href="#watches"
                    className="flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-[0.95rem] font-medium shadow-card transition-[border-color,transform] hover:border-ring/50 active:scale-[0.98]"
                  >
                    <ArrowDown className="size-4" aria-hidden />
                    How a watch works
                  </a>
                  <a href="#film" className="flex h-12 items-center justify-center gap-2 rounded-full px-4 text-[0.95rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <Play className="size-4" aria-hidden />
                    See it work
                  </a>
                </Rise>
                {signedIn ? null : (
                  <Rise delay={0.22}>
                    <p className="mt-4 text-[0.82rem] text-subtle">Accounts are by invitation for now.</p>
                  </Rise>
                )}
              </div>

              {/* A watch, as the app shows it: what was asked, what it checks, and the change it found. A phone and two notices sit in front of it. */}
              <Rise delay={0.3} className="relative mx-auto mt-12 max-w-[1000px] sm:mt-16">
                <div className="stage-glow pointer-events-none absolute -inset-x-16 -inset-y-10 -z-10 hidden sm:block" aria-hidden />
                <BrowserFrame address="kestrel.zeroanomaly.tech">
                  <div className="bg-background px-3 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-10">
                    <div className="mx-auto max-w-[43rem]">
                      <Bubble>Tell me when any EU store sells these headphones under €300.</Bubble>
                      <WatchMock className="mt-4" />
                    </div>
                  </div>
                </BrowserFrame>

                <Drift by={-22} className="absolute -right-20 -bottom-16 z-20 hidden w-[13.5rem] xl:block">
                  <PhoneAlert />
                </Drift>
                <Drift by={30} className="absolute bottom-6 -left-32 z-20 hidden w-[15rem] space-y-2.5 xl:block">
                  <Notice icon={<BellRing />} title="Headphones under €300" line="The price dropped in Germany. Before, after and source inside." />
                  <Notice icon={<Check />} title="Junior jobs in Helsinki" line="Looked again. Nothing new, so no email." tone="quiet" />
                </Drift>
              </Rise>
              <p className="mt-5 text-center text-[0.8rem] text-subtle xl:mt-24">An example. The store and the prices are made up.</p>
            </div>
          </section>

          {/* ───────── The film ───────── */}
          <section id="film" className="scroll-mt-16 border-t border-border/60 bg-surface/50">
            <div className="mx-auto w-full max-w-[960px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle title="See it work" lead="A short film: a question, a watch, and what happens when something changes." />
              <Reveal className="mt-10 sm:mt-12">
                <DemoVideo src={demoVideo} />
              </Reveal>
            </div>
          </section>

          {/* ───────── Watches ───────── */}
          <section id="watches" className="scroll-mt-16 border-t border-border/60">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle
                kicker="Watches"
                icon={<Radar />}
                title="How a watch works"
                lead={`Ask once. ${APP_NAME} does the looking from then on.`}
                powered={<PoweredBy>Powered by Context.dev, Oxylabs and the Gemini Decisions API</PoweredBy>}
              />

              <Stagger className="mx-auto mt-8 flex max-w-[58rem] flex-wrap justify-center gap-2">
                {ASKS.map((ask) => (
                  <StaggerItem key={ask}>
                    <span className="block rounded-full border border-border bg-card px-4 py-2 text-[0.86rem] text-muted-foreground shadow-card">&ldquo;{ask}&rdquo;</span>
                  </StaggerItem>
                ))}
              </Stagger>

              <Stagger className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 lg:grid-cols-3">
                <Step n="1" title="Tell it once" text="Say what to find and what it has to meet, in plain words. Each condition becomes a check.">
                  <Conditions />
                </Step>
                <Step n="2" title="It keeps looking" text="On a schedule, and when a page it watches changes. Each time it reads the pages again and checks them again.">
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-surface hairline">
                    <QuietLook time="09:31" />
                    <QuietLook time="09:21" />
                    <QuietLook time="09:11" />
                  </ul>
                </Step>
                <Step n="3" title="It tells you what changed" text="You get the before, the after and the source. When nothing changed, it stays quiet.">
                  <ChangeBlock className="rounded-2xl" />
                </Step>
              </Stagger>

              <div className="mx-auto mt-12 grid max-w-[1040px] items-center gap-10 sm:mt-16 md:grid-cols-2 md:gap-14">
                <Reveal className="max-w-[31rem]">
                  <h3 className="font-display text-[1.6rem] leading-[1.15] text-balance sm:text-[2rem]">In the app and in your inbox</h3>
                  <p className="mt-3 text-[1.02rem] leading-relaxed text-muted-foreground">A change shows up as a notice in {APP_NAME}. If you are away, it comes by email too.</p>
                  <ul className="mt-6 space-y-3">
                    <Point icon={<ListFilter />} title="Made from any answer">
                      Press Watch this on a checked list or a price card. Or just ask for a watch.
                    </Point>
                    <Point icon={<Repeat />} title="Yours to change">
                      Pause it, edit it, delete it, or press Check now.
                    </Point>
                    <Point icon={<Clock />} title="Every look kept">
                      Each look is kept with what it found, so you can see what changed and when.
                    </Point>
                  </ul>
                </Reveal>
                <Reveal delay={0.08} className="relative">
                  <div className="stage-glow pointer-events-none absolute -inset-6 -z-10" aria-hidden />
                  <EmailMock />
                </Reveal>
              </div>
            </div>
          </section>

          {/* ───────── Ask for anything ───────── */}
          <section id="ask" className="scroll-mt-16 border-t border-border/60 bg-surface/50">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle
                kicker="Ask"
                icon={<Sparkles />}
                title="Or just ask"
                lead="A one-off question works too. The answer is a card you can use, and every card shows its sources."
                powered={<PoweredBy>Powered by Context.dev and Oxylabs</PoweredBy>}
              />

              <Stagger className="mt-12 grid grid-cols-1 gap-4 sm:mt-14 lg:grid-cols-12">
                <Example className="lg:col-span-7" icon={<ListFilter />} label="Checked lists" question="Something quick for dinner with the chickpeas I have. Vegetarian, no nuts, one pan." name="sift" />
                <Example className="lg:col-span-5" icon={<MapPin />} label="Places" question="Where should we eat near Kamppi tonight?" name="places" />
                <Example className="lg:col-span-5" icon={<CloudSun />} label="Weather" question="Do I need a coat in Espoo this week?" name="weather" />
                <Example className="lg:col-span-7" icon={<Telescope />} label="Research" question="Should I lease or buy an electric car in Finland? I drive about 15,000 km a year." name="research" />

                <StaggerItem className="min-w-0 lg:col-span-12">
                  <div className="backdrop-room flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card sm:flex-row sm:items-center sm:gap-10 sm:p-7">
                    <div className="max-w-[30rem]">
                      <h3 className="font-display text-[1.5rem] leading-[1.1] sm:text-[1.8rem]">And more</h3>
                      <p className="mt-3 text-[0.98rem] leading-relaxed text-muted-foreground">
                        The same thing priced in several countries. The news on a subject. And when no card fits, {APP_NAME} builds one: a chart, a table, a timeline.
                      </p>
                    </div>
                    <ul className="mt-5 flex flex-wrap gap-1.5 sm:mt-0 sm:flex-1 sm:justify-end">
                      {MORE.map((name) => (
                        <li key={name} className="rounded-full border border-border bg-surface px-3 py-1.5 text-[0.8rem] text-muted-foreground">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </StaggerItem>
              </Stagger>
              <p className="mt-5 text-center text-[0.8rem] text-subtle">These are the app&apos;s real cards. Try them. What they show is sample data.</p>
            </div>
          </section>

          {/* ───────── How it works ───────── */}
          <section id="how" className="scroll-mt-16 border-t border-border/60">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle kicker="How it works" title="Each part does one job" lead="Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges." />
              <Stagger className="mx-auto mt-12 grid max-w-[1080px] grid-cols-1 gap-4 sm:mt-14 md:grid-cols-3">
                <Part icon={<Search />} name="Context.dev" job="Finds, reads and watches">
                  Search that brings back the text of each page in the same call. The news on a subject. And monitors that call {APP_NAME} when a watched page changes.
                </Part>
                <Part icon={<Tag />} name="Oxylabs" job="Localises and prices">
                  The same search as another country sees it, and shopping prices in each one. It also reads the pages that need a real browser.
                </Part>
                <Part icon={<Scale />} name="Gemini" job="Judges">
                  The Decisions API checks every page against every condition in one request. The answer is yes, no, or the page does not say.
                </Part>
              </Stagger>
            </div>
          </section>

          {/* ───────── Trust ───────── */}
          <section id="trust" className="scroll-mt-16 border-t border-border/60 bg-surface/50">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle kicker="Trust" icon={<ShieldCheck />} title="You can check its work" lead={`${APP_NAME} shows where every answer came from, and says so when it does not know.`} />
              <Stagger className="mx-auto mt-12 grid max-w-[1080px] grid-cols-1 gap-4 sm:mt-14 md:grid-cols-3">
                <Card icon={<Link2 />} title="A source on everything" text="Every card and every change links to the page it came from.">
                  <p className="rounded-2xl bg-surface px-4 py-3.5 text-[0.9rem] leading-relaxed hairline">
                    Now €289, was €329 <SourcePill>nordaudio.example</SourcePill>
                  </p>
                </Card>
                <Card icon={<CircleHelp />} title="It says when a page does not say" text="If a page does not state something, that is the answer you get. It is never filled in with a guess.">
                  <ul className="flex flex-wrap gap-1.5">
                    <Verdict icon={<Check />} tone="yes">
                      Yes
                    </Verdict>
                    <Verdict icon={<X />} tone="no">
                      No
                    </Verdict>
                    <Verdict icon={<CircleHelp />}>The page does not say</Verdict>
                  </ul>
                </Card>
                <Card icon={<FileX />} title="Failures said plainly" text="A page that could not be read is listed as unread. It is not skipped in silence.">
                  <p className="flex items-center gap-2.5 rounded-2xl bg-surface px-4 py-3.5 text-[0.88rem] text-muted-foreground hairline">
                    <FileX className="size-4 shrink-0 text-subtle" aria-hidden />
                    One page could not be read
                  </p>
                </Card>
              </Stagger>
            </div>
          </section>

          {/* ───────── The rest ───────── */}
          <section id="more" className="scroll-mt-16 border-t border-border/60">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
              <SectionTitle title="And the rest" lead="Small things that make it easy to live with." />
              <Stagger className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <Card className="lg:col-span-3" icon={<AudioLines />} title="Talk to it" text={`Say it out loud. ${APP_NAME} answers by voice while the cards arrive on screen. Powered by Gemini 3.8 Live.`}>
                  <VoiceBars />
                </Card>
                <Card className="lg:col-span-3" icon={<Bell />} title="Tells you when it matters" text="A watch found a change, or a long chat is done. You see it in the app, and get an email only when you are away.">
                  <ul className="space-y-1.5">
                    {[
                      [<BellRing key="i" />, "Changed: headphones under €300"],
                      [<Check key="i" />, "Done: lease or buy an electric car"],
                      [<Mail key="i" />, "The change is in your inbox"],
                    ].map(([icon, line]) => (
                      <li key={String(line)} className="flex h-10 items-center gap-2.5 rounded-xl bg-surface px-3 text-[0.84rem] hairline">
                        <span className="flex size-5 shrink-0 items-center justify-center text-brand [&_svg]:size-4">{icon}</span>
                        <span className="min-w-0 flex-1 truncate">{line}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="lg:col-span-2" icon={<ModeIcon mode="smart" />} title="Pick your pace" text="Four modes and a dial for how hard it should think. Ultra fast is Gemini 4 Hydrogen, Fast is Claude Sonnet 5.5, Smart is Claude Opus 5.5 and Expert is Gemini 4 Carbon.">
                  <ModesDemo />
                </Card>
                <Card className="lg:col-span-2" icon={<Layers />} title="Keeps working without you" text="Close the tab or start something else. Your chat keeps working, and you can have several going at once.">
                  <ul className="space-y-1.5">
                    {[
                      ["Lease or buy an electric car", true],
                      ["Quick dinners with chickpeas", true],
                      ["Coffee shops in Kallio", false],
                    ].map(([chat, running]) => (
                      <li key={String(chat)} className="flex h-10 items-center gap-2.5 rounded-xl bg-surface px-3 text-[0.84rem] hairline">
                        <span className="min-w-0 flex-1 truncate">{chat}</span>
                        {running ? <span className="size-2 shrink-0 animate-pulse-dot rounded-full bg-brand" aria-label="Working" /> : <Check className="size-4 shrink-0 text-subtle" aria-label="Done" />}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="sm:col-span-2 lg:col-span-2" icon={<Users />} title="Made for teams" text="An admin hands out accounts, chooses which modes each person gets, and sets a spending limit.">
                  <div className="rounded-2xl bg-surface p-3.5 hairline">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[0.7rem] font-semibold text-brand">AM</span>
                      <span className="min-w-0 flex-1 truncate text-[0.86rem] font-medium">Alex Morgan</span>
                      <span className="nums text-[0.78rem] text-muted-foreground">$6.20 of $10</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-[62%] rounded-full bg-brand" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(["ultrafast", "fast", "smart"] as const).map((id) => (
                        <span key={id} className="flex h-7 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-[0.74rem] font-medium text-brand">
                          <ModeIcon mode={id} className="size-3.5" />
                          {id === "ultrafast" ? "Ultra fast" : id === "fast" ? "Fast" : "Smart"}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              </Stagger>
              <p className="mx-auto mt-8 flex max-w-[40rem] items-center justify-center gap-2 text-center text-[0.9rem] text-muted-foreground">
                <Smartphone className="size-4 shrink-0 text-brand" aria-hidden />
                Nothing to install. Open it in any browser, or add it to your phone&apos;s home screen.
              </p>
            </div>
          </section>

          {/* ───────── Powered by ───────── */}
          <section id="powered" className="scroll-mt-16 border-t border-border/60 bg-surface/50">
            <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
              <p className="text-center text-[0.78rem] font-medium tracking-[0.14em] text-subtle uppercase">Powered by</p>
              <Stagger className="mx-auto mt-8 grid max-w-[1120px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Maker name="Context.dev" what="Search with the page text, the news, and the monitors behind every watch." />
                <Maker name="Oxylabs" what="Search and prices country by country, facts pulled from a page, and a second reader for hard pages." />
                <Maker name="Gemini" by="Google" what="Gemini 4 Hydrogen and Gemini 4 Carbon think in the Ultra fast and Expert modes. Gemini 3.8 Live is the voice. The Gemini Decisions API does the checking." />
                <Maker name="Claude" by="Anthropic" what="Claude Sonnet 5.5 and Claude Opus 5.5 think in the Fast and Smart modes, in chats and in research." />
              </Stagger>
            </div>
          </section>

          {/* ───────── The way in ───────── */}
          <section className="backdrop-room border-t border-border/60">
            <Reveal className="mx-auto flex w-full max-w-[1180px] flex-col items-center px-5 py-16 text-center sm:px-8 sm:py-24">
              <Logo size={52} className="rounded-2xl shadow-card" />
              <h2 className="font-display mt-6 text-[2rem] leading-[1.1] text-balance sm:text-[2.6rem]">Got something to keep an eye on?</h2>
              <p className="mt-3 text-[1.02rem] text-muted-foreground">{signedIn ? "Pick up where you left off." : "Sign in and set your first watch."}</p>
              <SignInLink signedIn={signedIn} className="mt-7" />
            </Reveal>
          </section>
        </main>

        <footer className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-8 text-[0.84rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-2.5">
              <Logo size={24} className="rounded-md" />
              <span>{APP_NAME}. Built at Junction 2026 in Espoo.</span>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                ["#film", "Demo"],
                ["#watches", "Watches"],
                ["#ask", "Ask"],
                ["#how", "How it works"],
                ["#trust", "Trust"],
                [signedIn ? "/" : "/login", signedIn ? `Open ${APP_NAME}` : "Sign in"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="transition-colors hover:text-foreground">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </Motion>
  );
}

/* ───────── Pieces ───────── */

function Kicker({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[0.8rem] font-medium text-brand">
      {icon ? <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft [&_svg]:size-4">{icon}</span> : null}
      {children}
    </p>
  );
}

function SectionTitle({ kicker, icon, title, lead, powered }: { kicker?: string; icon?: React.ReactNode; title: string; lead?: string; /** What this feature runs on: a `PoweredBy` line. */ powered?: React.ReactNode }) {
  return (
    <Reveal className="mx-auto max-w-[42rem] text-center">
      {kicker ? <Kicker icon={icon}>{kicker}</Kicker> : null}
      <h2 className={cn("font-display text-[2rem] leading-[1.1] text-balance sm:text-[2.6rem]", kicker && "mt-4")}>{title}</h2>
      {lead ? <p className="mt-3 text-[1.02rem] leading-relaxed text-pretty text-muted-foreground">{lead}</p> : null}
      {powered ? <div className="mt-4 flex justify-center">{powered}</div> : null}
    </Reveal>
  );
}

/** What a feature runs on, in words. The same quiet line under every feature. */
function PoweredBy({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("inline-flex max-w-full rounded-2xl border border-border/70 bg-card/60 px-3 py-1.5 text-left text-[0.78rem] leading-snug text-muted-foreground", className)}>{children}</p>;
}

/** What someone typed, as the chat shows it. */
function Bubble({ children }: { children: React.ReactNode }) {
  return <p className="ml-auto w-fit max-w-[88%] rounded-[1.25rem] rounded-br-md bg-muted px-4 py-2.5 text-left text-[0.92rem] leading-snug text-foreground">{children}</p>;
}

/** One thing you can ask for: the question, and the card it gets, live. */
function Example({ icon, label, question, name, className }: { icon: React.ReactNode; label: string; question: string; name: DemoName; className?: string }) {
  return (
    <StaggerItem className={cn("min-w-0", className)}>
      {/* On a phone the card inside gets nearly the whole width of the tile: it lays itself out by the room it has. */}
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card/60 py-3 sm:p-4">
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 sm:px-1">
          <Kicker icon={icon}>{label}</Kicker>
        </div>
        <div className="mt-3 min-w-0 px-3 sm:px-0">
          <Bubble>{question}</Bubble>
        </div>
        {/* Under 400 px the card is drawn at nine tenths of its size, so it has the room it has in the app on a phone. */}
        <div className="fade-below mt-3 h-[23rem] w-full min-w-0 overflow-hidden px-1.5 sm:px-0">
          <Live name={name} className="w-full min-w-0 max-[399px]:[zoom:0.9]" />
        </div>
      </div>
    </StaggerItem>
  );
}

function Point({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:size-4">{icon}</span>
      <span className="text-[0.92rem] leading-snug">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}

/** A notice like the ones the app shows, floating in front of the hero. */
function Notice({ icon, title, line, tone = "brand" }: { icon: React.ReactNode; title: string; line: string; tone?: "brand" | "quiet" }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/95 p-3.5 text-left shadow-float backdrop-blur">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", tone === "quiet" ? "bg-muted text-muted-foreground" : "bg-brand-soft text-brand")}>{icon}</span>
      <span className="min-w-0 text-[0.82rem] leading-snug">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-muted-foreground">{line}</span>
      </span>
    </div>
  );
}

/** One of the three steps of a watch: its number, what happens, and a small picture of it. */
function Step({ n, title, text, children }: { n: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <StaggerItem className="min-w-0">
      <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <span className="nums flex size-9 items-center justify-center rounded-xl bg-brand-soft text-[0.95rem] font-semibold text-brand" aria-hidden>
          {n}
        </span>
        <h3 className="mt-4 text-[1.12rem] leading-tight font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-muted-foreground">{text}</p>
        <div className="mt-5 md:mt-auto md:pt-5">{children}</div>
      </div>
    </StaggerItem>
  );
}

/** One of the smaller things: a name, a sentence, and something to look at. */
function Card({ icon, title, text, className, children }: { icon: React.ReactNode; title: string; text: string; className?: string; children?: React.ReactNode }) {
  return (
    <StaggerItem className={cn("min-w-0", className)}>
      <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand [&_svg]:size-[1.1rem]">{icon}</span>
        <h3 className="mt-4 text-[1.08rem] leading-tight font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-muted-foreground">{text}</p>
        {children ? <div className="mt-5 pt-0 md:mt-auto md:pt-5">{children}</div> : null}
      </div>
    </StaggerItem>
  );
}

function SourcePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2 align-middle text-[0.72rem] text-muted-foreground">
      <span className="size-2.5 rounded-full bg-brass" aria-hidden />
      {children}
    </span>
  );
}

/** One of the three answers a check can give. */
function Verdict({ icon, tone, children }: { icon: React.ReactNode; tone?: "yes" | "no"; children: React.ReactNode }) {
  return (
    <li className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[0.8rem] text-foreground">
      <span className={cn("[&_svg]:size-3.5", tone === "yes" ? "text-up" : tone === "no" ? "text-down" : "text-subtle")} aria-hidden>
        {icon}
      </span>
      {children}
    </li>
  );
}

/** One of the services Kestrel stands on, and the one job it has here. The name is set in type: no logo files. */
function Part({ icon, name, job, children }: { icon: React.ReactNode; name: string; job: string; children: React.ReactNode }) {
  return (
    <StaggerItem className="min-w-0">
      <div className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-card sm:p-7">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand [&_svg]:size-5">{icon}</span>
        <p className="font-display mt-5 text-[1.6rem] leading-none">{name}</p>
        <p className="mt-2 text-[0.84rem] font-medium text-brand">{job}</p>
        <p className="mt-3 text-[0.94rem] leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </StaggerItem>
  );
}

/** One of those whose work Kestrel stands on: its name, set in type, and what it does here. */
function Maker({ name, by, what }: { name: string; by?: string; what: string }) {
  return (
    <StaggerItem>
      <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card px-6 py-7 text-center shadow-card">
        <p className="font-display text-[1.45rem] leading-none">{name}</p>
        <p className="mt-1.5 h-4 text-[0.78rem] text-subtle">{by ? `by ${by}` : ""}</p>
        <p className="mt-3 text-[0.9rem] leading-relaxed text-muted-foreground">{what}</p>
      </div>
    </StaggerItem>
  );
}

/* ───────── A watch, drawn ─────────
 * The pieces of the example watch the page shows: its conditions, a look that found nothing, the
 * change it found, and the whole card. The store and the prices are made up, and the page says so.
 */

const CONDITIONS = ["Under €300", "New, not refurbished", "Sold by an EU store"];

function Conditions({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {CONDITIONS.map((condition) => (
        <li key={condition} className="flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[0.76rem] text-muted-foreground">
          <Check className="size-3 shrink-0 text-brand" aria-hidden />
          {condition}
        </li>
      ))}
    </ul>
  );
}

/** A look that found nothing new: one quiet line. */
function QuietLook({ time }: { time: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-[0.84rem] text-muted-foreground sm:px-5">
      <span className="nums w-11 shrink-0 text-subtle">{time}</span>
      <Check className="size-3.5 shrink-0 text-subtle" aria-hidden />
      <span>Looked. Nothing new.</span>
    </li>
  );
}

/** The change: what happened, the before, the after and the source. */
function ChangeBlock({ className }: { className?: string }) {
  return (
    <div className={cn("bg-brand-soft/50 px-4 py-3.5 sm:px-5", className)}>
      <p className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.1em] text-brand uppercase">
        <BellRing className="size-3.5" aria-hidden />
        Changed · 09:41
      </p>
      <p className="mt-1.5 text-[0.95rem] leading-snug font-medium">The price dropped at a store in Germany</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="nums rounded-lg bg-card px-2.5 py-1 text-[0.88rem] text-muted-foreground line-through hairline">
          <span className="sr-only">Before: </span>€329
        </span>
        <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="nums rounded-lg bg-primary px-2.5 py-1 text-[0.88rem] font-semibold text-primary-foreground">
          <span className="sr-only">After: </span>€289
        </span>
        <SourcePill>nordaudio.example</SourcePill>
      </div>
    </div>
  );
}

/** The watch as the app lists it: what it is called, when it looked, what it checks, and what it has found. */
function WatchMock({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card", className)}>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Radar className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] font-semibold tracking-tight">Headphones under €300</p>
          <p className="truncate text-[0.78rem] text-muted-foreground">Looked a moment ago · looks again in 10 minutes</p>
        </div>
        <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-[0.74rem] font-medium text-brand">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-brand" aria-hidden />
          Watching
        </span>
      </div>
      <Conditions className="px-4 pb-3.5 sm:px-5" />
      <div className="border-t border-border/70">
        <ChangeBlock />
        <ul className="divide-y divide-border/60 border-t border-border/60">
          <QuietLook time="09:31" />
          <QuietLook time="09:21" />
        </ul>
      </div>
    </div>
  );
}

/** The same change as a phone shows it: a notice on the lock screen. */
function PhoneAlert() {
  return (
    <PhoneFrame>
      <div className="backdrop-room flex aspect-[9/17] flex-col px-[6cqw] pt-[9cqw] pb-[7cqw]">
        <p className="text-center text-[4.6cqw] text-muted-foreground">Monday 16 November</p>
        <p className="nums font-display text-center text-[23cqw] leading-none">9:41</p>
        <div className="mt-auto rounded-[5.5cqw] border border-border bg-card/95 p-[4.2cqw] text-left shadow-float">
          <div className="flex items-center gap-[2.4cqw]">
            <Logo size={18} className="rounded-[0.3rem]" />
            <span className="text-[4cqw] font-semibold">{APP_NAME}</span>
            <span className="ml-auto text-[3.4cqw] text-subtle">now</span>
          </div>
          <p className="mt-[2.6cqw] text-[4.3cqw] leading-snug font-medium">Headphones under €300</p>
          <p className="mt-[0.8cqw] text-[3.9cqw] leading-snug text-muted-foreground">The price dropped in Germany: €329 to €289.</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

/**
 * The email a watch sends when it finds a change, small. It is light whatever the page's theme,
 * as in an inbox, and laid out like the real one (src/lib/email/layout.ts): the label, the
 * watch's name, when, what changed, the way back. The store and the prices are made up.
 */
function EmailMock() {
  const ink = "oklch(0.21 0.03 262)";
  const muted = "oklch(0.5 0.02 262)";
  const brand = "oklch(0.29 0.07 262)";
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-[oklch(0.965_0.005_90)] text-left shadow-float" style={{ color: ink }}>
      <div className="flex items-center gap-2.5 border-b border-black/10 bg-white/70 px-4 py-2.5 text-[0.74rem]" style={{ color: muted }}>
        <Mail className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold" style={{ color: ink }}>
            {APP_NAME}
          </span>{" "}
          · Headphones under €300 · Mon 09:41
        </span>
      </div>
      <div className="p-4">
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <p className="text-[0.62rem] font-semibold tracking-[0.1em] uppercase" style={{ color: brand }}>
            Something changed
          </p>
          <p className="mt-1.5 text-[1.02rem] leading-tight font-bold">Headphones under €300</p>
          <p className="mt-1 text-[0.72rem]" style={{ color: muted }}>
            Mon 16 Nov, 09:41 · The price dropped at a store in Germany
          </p>
          <dl className="mt-3 space-y-2 border-t border-black/10 pt-3 text-[0.8rem] leading-snug">
            {[
              ["Before", "€329"],
              ["After", "€289"],
              ["Source", "nordaudio.example"],
            ].map(([term, value]) => (
              <div key={term} className="flex gap-3">
                <dt className="w-14 shrink-0" style={{ color: muted }}>
                  {term}
                </dt>
                <dd className={cn("nums font-semibold", term === "Source" && "underline")} style={term === "Source" ? { color: brand } : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <span className="mt-3.5 inline-flex h-7 items-center rounded-full px-3 text-[0.72rem] font-semibold text-white" style={{ background: brand }}>
            Open this watch
          </span>
        </div>
      </div>
    </div>
  );
}
