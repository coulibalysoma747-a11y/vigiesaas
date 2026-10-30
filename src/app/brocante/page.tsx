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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-extrabold">Brocante des SaaS abandonnés</h1>
      <p className="mt-1 text-slate-500">Projets laissés par leurs créateurs. Contacte-les pour les racheter.</p>

      {user && (
        <button className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Déposer un SaaS"}
        </button>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Nom du SaaS" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
          <textarea className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Raison de l'abandon" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Prix demandé (optionnel)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <button className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Publier</button>
        </form>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="font-semibold text-slate-800">{it.name}</p>
            <a className="text-sm text-brand-600 hover:underline" href={it.url} target="_blank" rel="noreferrer">{it.url}</a>
            {it.description && <p className="mt-2 text-sm text-slate-600">{it.description}</p>}
            {it.reason && <p className="mt-1 text-xs text-slate-500">Raison : {it.reason}</p>}
            {it.price && <p className="mt-2 text-sm font-bold text-brand-700">Prix : {it.price}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

