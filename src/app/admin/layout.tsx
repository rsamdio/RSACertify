import type { Metadata } from "next";
import { AuthGate } from "@/components/admin/AuthGate";

export const metadata: Metadata = {
  title: {
    default: "Admin | Rotaract Certify",
    template: "%s | Rotaract Certify"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
