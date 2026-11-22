import { DemoStoreProvider } from "@/features/demo/demo-store";
import { MobileHeader } from "@/components/layout/mobile-header";
import { BottomNav, Sidebar } from "@/components/layout/navigation";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <DemoStoreProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-ui bg-inverse px-4 py-2 text-on-inverse focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-60">
        <MobileHeader />
        <main
          id="main"
          className="mx-auto w-full max-w-4xl pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:pb-16"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </DemoStoreProvider>
  );
}
