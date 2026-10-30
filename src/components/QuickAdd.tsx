"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PENDING_URL_KEY } from "@/lib/pending-url";

/** Champ « adresse de ton site » de l'appel à l'action : l'adresse est gardée le temps de créer le compte, puis préremplie dans le tableau de bord. */
export function QuickAdd() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (url.trim()) window.sessionStorage.setItem(PENDING_URL_KEY, url.trim());
    } catch {
      // stockage indisponible : l'adresse sera simplement à retaper
    }
    router.push("/connexion");
  };

  return (
    <form onSubmit={submit} className="mt-6 flex w-full max-w-lg flex-col gap-1 rounded-xl bg-surface-container-lowest p-1.5 shadow-lg sm:flex-row">
      <label className="flex flex-1 items-center gap-2 px-2 text-on-surface">
        <Icon name="globe" size={20} className="shrink-0 text-text-muted" />
        <span className="sr-only">Adresse de ton site</span>
        <input className="w-full bg-transparent py-2 text-body-md text-on-surface outline-none placeholder:text-text-muted" placeholder="ton-saas.com" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <button className="btn-primary whitespace-nowrap !py-3" type="submit">Surveiller mon site</button>
    </form>
  );
}
