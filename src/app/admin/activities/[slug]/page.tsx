import { Suspense } from "react";
import { ActivityEditorClient } from "./ActivityEditorClient";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ActivityEditorPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="card admin-panel">Loading activity…</div>}>
      <ActivityEditorClient slug={slug} />
    </Suspense>
  );
}
