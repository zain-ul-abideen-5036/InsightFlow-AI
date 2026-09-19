import type { Metadata } from "next";

import { DemoLauncher } from "@/app/(marketing)/demo/demo-launcher";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Explore InsightFlow AI with NovaMart, a fictional retailer with fifteen months of "
    + "order history — no account, no spreadsheet, no setup.",
  // A throwaway workspace per visit: nothing here is worth indexing, and every
  // crawl would create one.
  robots: { index: false, follow: true },
};

export default function DemoPage() {
  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <DemoLauncher />
    </div>
  );
}
