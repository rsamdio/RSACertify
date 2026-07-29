"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const SCROLL_KEY = "rc-scroll-to";

export function SoftScrollLink({
  targetId,
  children
}: {
  targetId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const scroll = () => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };

    if (pathname === "/") {
      scroll();
      return;
    }

    try {
      sessionStorage.setItem(SCROLL_KEY, targetId);
    } catch {
      // ignore storage failures
    }
    router.push("/");
  }

  return (
    <a href="/" onClick={onClick}>
      {children}
    </a>
  );
}

/** Place once on the home page so cross-route soft scrolls land without a URL hash. */
export function HomeScrollHandler() {
  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(SCROLL_KEY);
      if (target) sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      return;
    }
    if (!target) return;

    const id = target;
    const run = () => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    };

    const t = window.setTimeout(run, 60);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
