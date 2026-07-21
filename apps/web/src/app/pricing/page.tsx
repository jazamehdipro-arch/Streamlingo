"use client";

import { Suspense } from "react";
import BillingPanel from "@/components/BillingPanel";

export default function PricingPage() {
  return (
    <main className="min-h-screen px-6 py-12">
      <Suspense fallback={<div />}>
        <BillingPanel />
      </Suspense>
    </main>
  );
}
