import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  GitBranch,
  Inbox,
  HardDrive,
  MonitorSpeaker,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devops", label: "DevOps", icon: GitBranch },
  { href: "/focus", label: "Focus Feed", icon: Inbox },
  { href: "/storage", label: "Storage", icon: HardDrive },
  { href: "/environment", label: "Environment", icon: MonitorSpeaker },
  { href: "/workflow", label: "Workflow", icon: Zap },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex flex-col w-64 h-screen border-r border-border bg-card">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight text-primary font-mono flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          AETHER-OS
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent cursor-pointer",
                location === item.href
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </div>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground font-mono">
          SYS_VERSION: 0.1.0-alpha
        </div>
      </div>
    </div>
  );
}
