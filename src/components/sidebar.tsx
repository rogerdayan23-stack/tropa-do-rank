"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clock,
  Activity,
  Trophy,
  Shield,
  AlertTriangle,
  DollarSign,
  LogOut,
  User,
  Menu,
  X,
  ChevronRight,
  UserCog,
  Crown,
  FileClock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavUser {
  id?: string;
  username?: string;
  role?: string;
  avatar_url?: string;
  is_admin?: boolean;
}

const navItems = [
  { label: "Início", href: "/dashboard", icon: Clock },
  { label: "Histórico", href: "/historico", icon: Activity },
  { label: "Ranking", href: "/ranking", icon: Trophy },
  { label: "Regras", href: "/regras", icon: Shield },
];

const adminItems = [
  { label: "Penalidades", href: "/penalidades", icon: AlertTriangle },
  { label: "Saldos", href: "/saldos", icon: DollarSign },
];

const adminMasterItems = [
  { label: "Gerenciar Usuários", href: "/admin/usuarios", icon: UserCog },
];
const adminSharedItems = [
  { label: "Registros", href: "/admin/registros", icon: FileClock },
  { label: "Monitoramento", href: "/admin/monitoramento", icon: Clock },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [open, setOpen] = useState(false);

  const carregar = async () => {
    try {
      const stored = localStorage.getItem("rankfarm_user");
      if (stored) setUser(JSON.parse(stored));
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          localStorage.setItem("rankfarm_user", JSON.stringify(data.user));
        }
      }
    } catch {}
  };

  useEffect(() => {
    carregar();
    window.addEventListener("user_updated", carregar);
    return () => window.removeEventListener("user_updated", carregar);
  }, [pathname]);

  // Fecha sidebar mobile ao navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname === "/login" || pathname === "/register") return null;

  const handleLogout = async () => {
    localStorage.removeItem("rankfarm_user");
    localStorage.removeItem("tropa_token");
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const avatarSrc = user?.avatar_url
    ? user.avatar_url.startsWith("http")
      ? user.avatar_url
      : `/${user.avatar_url.replace(/^\//, "")}`
    : null;

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/15"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        )}
      >
        <Icon size={18} className={isActive ? "text-primary-foreground" : ""} />
        <span>{label}</span>
        {isActive && <ChevronRight size={14} className="ml-auto text-primary-foreground/70" />}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border/40">
        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-rose-300/35 bg-gradient-to-br from-rose-500/25 to-amber-200/10 shadow-[0_0_20px_rgba(236,72,126,0.15)]">
          <Crown size={21} strokeWidth={2.2} className="text-rose-200" />
        </div>
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[11px] font-black tracking-[0.08em] text-foreground">RANK DOS CUIUDOS</p>
          <p className="text-xs text-muted-foreground">Não tem essa!</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-2">
          Navegação
        </p>
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="pt-4 pb-1">
          <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-2">
            Financeiro
          </p>
        </div>
        {adminItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {(user?.role === "admin" || user?.role === "moderador") && (
          <>
            <div className="pt-4 pb-1">
              <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-2">
                Admin
              </p>
            </div>
            {user.role === "admin" && adminMasterItems.map((item) => <NavLink key={item.href} {...item} />)}
            {adminSharedItems.map((item) => <NavLink key={item.href} {...item} />)}
          </>
        )}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-border/40 p-3 space-y-1">
        <Link
          href="/perfil"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            {avatarSrc ? (
              <img src={avatarSrc} alt={user?.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-primary">
                {user?.username?.[0]?.toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username || "..."}</p>
            <p className="text-xs text-muted-foreground">
              {user?.role === "admin"
                ? "👑 Admin Master"
                : user?.role === "moderador"
                ? "🛡️ Co-Admin"
                : "Jogador"}
            </p>
          </div>
          <User size={14} className="text-muted-foreground group-hover:text-foreground" />
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
        >
          <LogOut size={16} />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border/60 text-foreground shadow-lg"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — desktop fixed, mobile slide */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen w-60 bg-[#090c14] border-r border-border/60 z-40 transition-transform duration-200",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}

