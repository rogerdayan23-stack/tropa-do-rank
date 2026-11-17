"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, ShieldCheck, ArrowRight, Crown, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Estados de Login
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Estados de Cadastro
  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [showRegPass, setShowRegPass] = useState(false);
  const [regConfirmPass, setRegConfirmPass] = useState("");
  const [showRegConfirmPass, setShowRegConfirmPass] = useState(false);
  const [loadingRegister, setLoadingRegister] = useState(false);

  // Submissão de Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginUser.trim() || !loginPass) {
      toast.error("Preencha usuário e senha");
      return;
    }

    setLoadingLogin(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPass,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Salva token e dados do usuário no localStorage
        localStorage.setItem("rankfarm_token", data.token);
        localStorage.setItem("rankfarm_user", JSON.stringify(data.user));

        toast.success(`Bem-vindo de volta, ${data.user.username}!`);
        router.push("/dashboard");
      } else {
        toast.error(data.error || "Usuário ou senha incorretos");
      }
    } catch {
      toast.error("Erro ao conectar com o servidor");
    } finally {
      setLoadingLogin(false);
    }
  };

  // Submissão de Cadastro
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regUser.trim()) {
      toast.error("Digite um nome de usuário");
      return;
    }

    if (regUser.trim().length < 3) {
      toast.error("O usuário deve ter pelo menos 3 caracteres");
      return;
    }

    if (!regPass || regPass.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    if (regPass !== regConfirmPass) {
      toast.error("As senhas não coincidem");
      return;
    }

    setLoadingRegister(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUser.trim(),
          password: regPass,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Conta criada com sucesso! Faça login para continuar.");
        setLoginUser(regUser.trim());
        setLoginPass("");
        setRegPass("");
        setRegConfirmPass("");
        setActiveTab("login");
      } else {
        toast.error(data.error || "Erro ao realizar cadastro");
      }
    } catch {
      toast.error("Erro de conexão ao cadastrar");
    } finally {
      setLoadingRegister(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] w-full items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-2xl border-border/60 bg-[#121212]/90 backdrop-blur-md">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="h-12 w-12 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary mx-auto font-bold shadow-lg shadow-primary/10">
            <Crown size={26} strokeWidth={2.2} />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-foreground">
            RANK DOS CUIUDOS
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Sistema Oficial de Farm & Divisão de Lucros
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "login" | "register")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/60">
              <TabsTrigger value="login" className="font-semibold text-sm">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="register" className="font-semibold text-sm">
                Cadastrar
              </TabsTrigger>
            </TabsList>

            {/* ABA DE LOGIN */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-username" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Nome de Usuário
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-username"
                      placeholder="Ex: dnz, ch, th..."
                      className="pl-9 bg-[#1a1a1a] border-border/50 focus-visible:ring-primary"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      disabled={loadingLogin}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showLoginPass ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-9 pr-10 bg-[#1a1a1a] border-border/50 focus-visible:ring-primary"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      disabled={loadingLogin}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors p-1 rounded focus:outline-none"
                      tabIndex={-1}
                      title={showLoginPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-md transition-all mt-2"
                  disabled={loadingLogin}
                >
                  {loadingLogin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    <>
                      Entrar no Sistema
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* ABA DE CADASTRO */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-username" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Escolha um Nome de Usuário
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-username"
                      placeholder="Mínimo 3 caracteres"
                      className="pl-9 bg-[#1a1a1a] border-border/50 focus-visible:ring-primary"
                      value={regUser}
                      onChange={(e) => setRegUser(e.target.value)}
                      disabled={loadingRegister}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-password" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-password"
                      type={showRegPass ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      className="pl-9 pr-10 bg-[#1a1a1a] border-border/50 focus-visible:ring-primary"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      disabled={loadingRegister}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors p-1 rounded focus:outline-none"
                      tabIndex={-1}
                      title={showRegPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-confirm" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Confirmar Senha
                  </Label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-confirm"
                      type={showRegConfirmPass ? "text" : "password"}
                      placeholder="Repita a senha"
                      className="pl-9 pr-10 bg-[#1a1a1a] border-border/50 focus-visible:ring-primary"
                      value={regConfirmPass}
                      onChange={(e) => setRegConfirmPass(e.target.value)}
                      disabled={loadingRegister}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPass(!showRegConfirmPass)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors p-1 rounded focus:outline-none"
                      tabIndex={-1}
                      title={showRegConfirmPass ? "Ocultar senha" : "Ver senha"}
                    >
                      {showRegConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-md transition-all mt-2"
                  disabled={loadingRegister}
                >
                  {loadingRegister ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    <>
                      Criar Minha Conta
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border/40 pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Suas sessões de farm e lucros semanais registrados com segurança.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
