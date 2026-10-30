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

  if (loading) return <p className="p-6">Chargement…</p>;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input className="flex-1 rounded border p-2" placeholder="https://mon-saas.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <input className="w-40 rounded border p-2" placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="rounded bg-black px-4 py-2 text-white">Ajouter</button>
      </form>
      <ul className="mt-6 space-y-2">
        {monitors.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-semibold">{m.name}</p>
              <p className="text-sm text-slate-500">{m.url}</p>
              <p className="text-sm">Statut : {m.lastStatus === null ? "inconnu" : m.lastStatus ? "en ligne" : "hors ligne"}</p>
            </div>
            <button className="text-red-600" onClick={() => remove(m.id)}>Supprimer</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
