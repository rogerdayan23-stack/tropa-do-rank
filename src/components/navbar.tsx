"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, User, Clock, Trophy, Activity, Shield, LogOut, ChevronDown, DollarSign, AlertTriangle, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ id?: string; username?: string; role?: string; avatar_url?: string } | null>(null);

  const carregarUsuario = async () => {
    try {
      const stored = localStorage.getItem("rankfarm_user");
      if (stored) {
        setUser(JSON.parse(stored));
      }
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
    carregarUsuario();
    window.addEventListener("user_updated", carregarUsuario);
    return () => window.removeEventListener("user_updated", carregarUsuario);
  }, [pathname]);

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const handleLogout = async () => {
    try {
      localStorage.removeItem("rankfarm_token");
      localStorage.removeItem("rankfarm_user");
    } catch {}
    window.location.href = "/api/auth/logout";
  };

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: Clock },
    { href: "/historico", label: "Histórico", icon: Activity },
    { href: "/ranking", label: "Ranking", icon: Trophy },
    { href: "/regras", label: "Regras", icon: Shield },
    { href: "/saldos", label: "Saldos", icon: DollarSign },
    { href: "/penalidades", label: "Penalidades", icon: AlertTriangle },
  ];

  const username = user?.username || "Jogador";
  const initial = username.charAt(0).toUpperCase();
  const isAdmin = user?.role === "admin";

  return (
    <nav className="fixed top-0 left-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="h-9 w-9 rounded-xl border border-yellow-400/35 bg-gradient-to-br from-emerald-500/20 to-yellow-400/10 flex items-center justify-center text-yellow-300 shadow-md shadow-yellow-500/10">
            <Crown size={19} />
          </div>
          <span className="whitespace-nowrap text-sm sm:text-base font-black tracking-tight text-foreground">
            RANK DOS <span className="text-primary">CUIUDOS</span>
          </span>
        </Link>

        {/* Links Centrais */}
        <div className="hidden md:flex items-center gap-1.5">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Menu do Usuário no Canto Direito com Foto 32x32px */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2.5 px-3 py-1 rounded-full border border-border/70 bg-card hover:bg-muted/70 hover:border-primary/50 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer shadow-sm"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={username}
                    className="h-8 w-8 rounded-full object-cover border border-primary/40 shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {initial}
                  </div>
                )}
                <span className="text-sm font-medium text-foreground max-w-[120px] truncate">
                  {username}
                </span>
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={12}
              className="w-60 p-3 rounded-xl bg-[#121212] border border-border/80 shadow-2xl"
            >
              {/* Header do Card com o Usuário */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 mb-2">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={username}
                    className="h-10 w-10 rounded-full object-cover border border-primary/40 shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {initial}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-foreground truncate">
                    {username}
                  </span>
                  <span className="text-[11px] text-primary font-medium tracking-wide flex items-center gap-1.5 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block"></span>
                    {isAdmin ? "🛡️ Administrador" : "🟢 Jogador Ativo"}
                  </span>
                </div>
              </div>

              <DropdownMenuSeparator className="my-2.5 bg-border/40" />

              <div className="space-y-1">
                <DropdownMenuItem
                  onClick={() => router.push("/perfil")}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                >
                  <User size={16} className="text-muted-foreground" />
                  <span>Meu Perfil</span>
                </DropdownMenuItem>

                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => router.push("/admin")}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                  >
                    <Shield size={16} className="text-muted-foreground" />
                    <span>Painel Admin</span>
                  </DropdownMenuItem>
                )}
              </div>

              <DropdownMenuSeparator className="my-2.5 bg-border/40" />

              <DropdownMenuItem
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive rounded-lg cursor-pointer hover:bg-destructive/15 transition-colors font-semibold"
              >
                <LogOut size={16} className="text-destructive" />
                <span>Sair da Conta</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="icon" variant="ghost" className="md:hidden" onClick={() => {}}>
            <Menu size={20} />
          </Button>
        </div>
      </div>
    </nav>
  );
}
