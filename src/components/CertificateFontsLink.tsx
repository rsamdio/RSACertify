"use client";

import { useEffect } from "react";
import { CERTIFICATE_WEB_FONTS_HREF } from "@/lib/certificate-fonts";

const LINK_ID = "certificate-web-fonts";

/** Loads certificate web fonts only when Placement or public download needs them. */
export function CertificateFontsLink() {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "stylesheet";
    link.href = CERTIFICATE_WEB_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  return null;
}
