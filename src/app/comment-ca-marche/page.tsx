export default function CommentCaMarche() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-extrabold">Comment ça marche</h1>
      <ol className="mt-6 space-y-4">
        {[
          "Crée un compte gratuit.",
          "Ajoute l'URL de ton SaaS dans le tableau de bord.",
          "Toutes les 5 minutes, Vigie vérifie si ton SaaS répond.",
          "S'il tombe ou revient en ligne, tu reçois un e-mail.",
          "Si tu abandonnes un projet, dépose-le dans la brocante pour qu'un autre créateur le rachète.",
        ].map((step, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</span>
            <p className="text-slate-700">{step}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-slate-500">100 % gratuit pour la V1. Monétisation (plans payants, plus de monitors) prévue en V2.</p>
    </div>
  );
}
