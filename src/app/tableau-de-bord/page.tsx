"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [monitors, setMonitors] = useState<{ id: string; name: string; url: string; lastStatus: boolean | null }[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    const q = query(collection(db, "monitors"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => setMonitors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; url: string; lastStatus: boolean | null }) }))));
    return () => unsub();
  }, [user, loading, router]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !url) return;
    await addDoc(collection(db, "monitors"), {
      userId: user.uid,
      userEmail: user.email,
      url,
      name: name || url,
      isActive: true,
      lastStatus: null,
      createdAt: serverTimestamp(),
    });
    setUrl(""); setName("");
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "monitors", id));
  };

  if (loading) return <p className="p-6 text-slate-500">Chargement…</p>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-extrabold">Tableau de bord</h1>
      <p className="mt-1 text-slate-500">Surveille tes SaaS. Ajoute une URL pour commencer.</p>

      <form onSubmit={add} className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <input className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="https://mon-saas.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <input className="sm:w-48 rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Ajouter</button>
      </form>

      <div className="mt-8 space-y-3">
        {monitors.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Aucun monitor pour l&apos;instant. Ajoute ton premier SaaS ci-dessus.
          </div>
        )}
        {monitors.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="font-semibold text-slate-800">{m.name}</p>
              <p className="text-sm text-slate-500">{m.url}</p>
              <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${m.lastStatus === null ? "bg-slate-100 text-slate-600" : m.lastStatus ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {m.lastStatus === null ? "Statut inconnu" : m.lastStatus ? "En ligne" : "Hors ligne"}
              </span>
            </div>
            <button className="text-sm font-medium text-red-600 hover:underline" onClick={() => remove(m.id)}>Supprimer</button>
          </div>
        ))}
      </div>
    </div>
  );
}

