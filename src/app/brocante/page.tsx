"use client";
import { useEffect, useState } from "react";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";

export default function Brocante() {
  const { user } = useAuth();
  const [items, setItems] = useState<{ id: string; name: string; url: string; description?: string; reason?: string; price?: string }[]>([]);
  const [form, setForm] = useState({ name: "", url: "", description: "", reason: "", price: "" });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "abandoned_saas"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; url: string; description?: string; reason?: string; price?: string }) }))));
    return () => unsub();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await addDoc(collection(db, "abandoned_saas"), {
      userId: user.uid,
      name: form.name,
      url: form.url,
      description: form.description,
      reason: form.reason,
      price: form.price,
      createdAt: serverTimestamp(),
    });
    setForm({ name: "", url: "", description: "", reason: "", price: "" });
    setShowForm(false);
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Brocante des SaaS abandonnés</h1>
      <p className="mt-2 text-slate-600">Projets laissés par leurs créateurs. Contacte-les pour les racheter.</p>
      {user && (
        <button className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "Déposer un SaaS"}
        </button>
      )}
      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-2 rounded border p-4">
          <input className="w-full rounded border p-2" placeholder="Nom du SaaS" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="w-full rounded border p-2" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
          <textarea className="w-full rounded border p-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="w-full rounded border p-2" placeholder="Raison de l'abandon" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <input className="w-full rounded border p-2" placeholder="Prix demandé (optionnel)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <button className="rounded bg-black px-4 py-2 text-white">Publier</button>
        </form>
      )}
      <ul className="mt-6 space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded border p-4">
            <p className="font-semibold">{it.name}</p>
            <a className="text-sm text-blue-600" href={it.url} target="_blank" rel="noreferrer">{it.url}</a>
            {it.description && <p className="mt-1 text-sm">{it.description}</p>}
            {it.reason && <p className="mt-1 text-xs text-slate-500">Raison : {it.reason}</p>}
            {it.price && <p className="mt-1 text-sm font-semibold">Prix : {it.price}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
