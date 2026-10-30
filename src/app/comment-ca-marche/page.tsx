export default function CommentCaMarche() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Comment ça marche</h1>
      <ol className="list-decimal pl-6 space-y-2">
        <li>Crée un compte gratuit.</li>
        <li>Ajoute l&apos;URL de ton SaaS dans le tableau de bord.</li>
        <li>Toutes les 5 minutes, Vigie vérifie si ton SaaS répond.</li>
        <li>S&apos;il tombe ou revient en ligne, tu reçois un e-mail.</li>
        <li>Si tu abandonnes un projet, dépose-le dans la brocante pour qu&apos;un autre créateur le rachète.</li>
      </ol>
      <p className="text-slate-600">100 % gratuit pour la V1. Monétisation (plans payants, plus de monitors) prévue en V2.</p>
    </main>
  );
}
