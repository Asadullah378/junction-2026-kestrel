import { Suspense } from "react";
import { JobsScreen } from "@/components/jobs/jobs-screen";

export const dynamic = "force-dynamic";

/** `/watches`, `/watches?job=<id>` for one watch or job, `/watches?job=<id>&run=<id>` for one of its runs. */
export default function WatchesPage() {
  // The screen reads the address, which a page may only do inside a boundary.
  return (
    <Suspense fallback={null}>
      <JobsScreen />
    </Suspense>
  );
}
