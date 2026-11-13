// src/app/page.tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-50 p-6">
      <div className="max-w-xl text-center space-y-4">
        <span className="px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
          Multi-Tenant B2B SaaS
        </span>
        <h1 className="text-4xl font-bold tracking-tight">
          NexStock Enterprise
        </h1>
        <p className="text-slate-400">
          Production-grade multi-tenant inventory, order fulfillment, and audit
          management engine built 100% with Next.js App Router.
        </p>
      </div>
    </main>
  );
}
