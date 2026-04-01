import { useState } from "react";
import { useLocation } from "wouter";
import { Settings, RefreshCw, Workflow, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Settings", href: "/", icon: Settings },
  { label: "Sync", href: "/sync", icon: RefreshCw },
];

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-screen z-40 w-56 border-r bg-card flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b shrink-0">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Workflow className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight leading-tight">Talkdesk<br />Knowledge Sync</span>
          <button
            className="ml-auto lg:hidden p-1 rounded-md hover:bg-muted"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <a
                key={item.href}
                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}${item.href}`}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
          Confluence → Talkdesk
        </div>
      </aside>

      <div className="lg:pl-56 h-screen flex flex-col">
        <header className="h-14 border-b bg-card flex items-center px-4 lg:hidden sticky top-0 z-20">
          <button
            className="p-1.5 rounded-md hover:bg-muted mr-3"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="bg-primary/10 p-1.5 rounded-md mr-2">
            <Workflow className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold">Talkdesk Knowledge Sync</span>
        </header>

        <main className="flex-1 p-6 lg:p-8 min-h-0 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
