import { useLocation } from "wouter";
import { Settings, RefreshCw, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Settings", href: "/", icon: Settings },
  { label: "Sync", href: "/sync", icon: RefreshCw },
];

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-56 border-r bg-card flex flex-col fixed top-0 left-0 h-screen z-20">
        <div className="h-14 flex items-center gap-2 px-4 border-b shrink-0">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Workflow className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight leading-tight">Talkdesk<br />Knowledge Sync</span>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <a
                key={item.href}
                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}${item.href}`}
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

      <main className="flex-1 ml-56">
        {children}
      </main>
    </div>
  );
}
