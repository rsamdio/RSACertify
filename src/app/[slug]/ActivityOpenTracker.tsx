"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function ActivityOpenTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent("activity_open", { slug });
  }, [slug]);
  return null;
}
