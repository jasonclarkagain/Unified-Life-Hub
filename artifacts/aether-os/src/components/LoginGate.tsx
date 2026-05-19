import { useState, useEffect, useCallback } from "react";
import { Lock, Zap, Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

type AuthState = "checking" | "unauthenticated" | "authenticated";

export function LoginGate({ children }: Props) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/healthz", { credentials: "include" });
      if (res.ok) {
        // healthz is public — we need to probe a protected endpoint
        const probe = await fetch("/api/devops/summary", { credentials: "include" });
        setAuthState(probe.status === 401 ? "unauthenticated" : "authenticated");
      } else {
        setAuthState("unauthenticated");
      }
    } catch {
      setAuthState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthState("authenticated");
        setPassword("");
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Login failed");
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  if (authState === "checking") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <Zap className="w-6 h-6 text-cyan-400" />
            <span className="text-white font-mono font-bold tracking-widest text-lg uppercase">
              Aether-OS
            </span>
          </div>

          <div className="border border-white/10 bg-white/5 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-cyan-400" />
              <h1 className="text-white font-mono font-semibold text-sm uppercase tracking-wider">
                Authentication Required
              </h1>
            </div>
            <p className="text-white/40 text-xs font-mono mb-5">
              Enter your dashboard password to continue
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm font-mono placeholder-white/30 focus:outline-none focus:border-cyan-400/60 transition-colors"
              />

              {error && (
                <p className="text-red-400 text-xs font-mono">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !password}
                className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-mono font-bold text-sm uppercase tracking-wider py-2 rounded transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Access Dashboard"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
