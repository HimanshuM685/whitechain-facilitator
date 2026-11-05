import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10">
      <DocsSidebar />
      <main className="min-w-0 flex-1 pb-10">{children}</main>
    </div>
  );
}
