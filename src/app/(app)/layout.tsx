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
          className="pl-safe pr-safe mx-auto w-full max-w-4xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-16"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </DemoStoreProvider>
  );
}
