// src/components/AuthProvider.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const Ctx = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);
  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
