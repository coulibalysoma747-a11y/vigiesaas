import { diagnose } from "@/lib/diagnosis";

/** « Pourquoi ? Comment régler ? » : la cause d'un problème en français simple, puis les étapes pour le régler. */
export function DiagnosisBox({ reason, kind = "down", open = false }: { reason: string | null | undefined; kind?: string; open?: boolean }) {
  const d = diagnose(reason, kind);
  if (!d) return null;
  return (
    <details open={open} className="mt-2 rounded-xl bg-surface-subtle px-4 py-3 text-body-sm">
      <summary className="cursor-pointer font-semibold text-on-surface-variant">Pourquoi ? Comment régler ?</summary>
      <p className="mt-2 text-on-surface"><strong>Pourquoi :</strong> {d.cause}</p>
      <p className="mt-2 font-semibold text-on-surface-variant">Comment régler :</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-on-surface-variant">
        {d.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
    </details>
  );
}
