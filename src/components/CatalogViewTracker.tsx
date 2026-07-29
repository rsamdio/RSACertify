"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function CatalogViewTracker() {
  useEffect(() => {
    trackEvent("catalog_view");
  }, []);
  return null;
}
