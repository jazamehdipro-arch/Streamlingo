export const metadata = { title: "Politique de confidentialité — StreamLingo" };

export default function PrivacyPage() {
  return (
    <main className="legal mx-auto max-w-2xl px-6 py-12">
      <h1>Politique de confidentialité</h1>
      <p className="text-sm text-neutral-400">Dernière mise à jour : juillet 2026</p>

      <h2>Qui sommes-nous</h2>
      <p>
        StreamLingo est un outil d&apos;apprentissage des langues (extension navigateur et
        application web) qui traduit les mots importants des vidéos et podcasts que vous regardez.
      </p>

      <h2>Données collectées</h2>
      <ul>
        <li>
          <strong>Compte</strong> : adresse email et mot de passe (hébergés par Supabase, mot de
          passe chiffré).
        </li>
        <li>
          <strong>Profil d&apos;apprentissage</strong> : langue cible, langue maternelle, niveau
          CECR, préférences d&apos;affichage.
        </li>
        <li>
          <strong>Données d&apos;apprentissage</strong> : mots rencontrés, traductions, progression
          de révision, identifiants des vidéos regardées avec l&apos;outil et transcriptions des
          passages analysés.
        </li>
        <li>
          <strong>Paiement</strong> : géré intégralement par Stripe. Nous ne stockons aucune donnée
          bancaire — uniquement un identifiant client Stripe et l&apos;état de l&apos;abonnement.
        </li>
      </ul>

      <h2>Ce que nous ne faisons pas</h2>
      <ul>
        <li>Nous ne vendons ni ne louons vos données à des tiers.</li>
        <li>Nous ne suivons pas votre navigation en dehors des pages où l&apos;outil est actif.</li>
        <li>Nous n&apos;affichons pas de publicité.</li>
      </ul>

      <h2>Sous-traitants</h2>
      <p>
        Vos données transitent par : Supabase (base de données, UE), Vercel (hébergement),
        Anthropic (analyse des transcriptions par IA — les transcriptions envoyées ne sont pas
        utilisées pour entraîner leurs modèles), Stripe (paiement).
      </p>

      <h2>Vos droits</h2>
      <p>
        Conformément au RGPD : accès, rectification, suppression, portabilité. Pour exercer ces
        droits ou supprimer votre compte et toutes vos données : contactez-nous et nous traiterons
        la demande sous 30 jours.
      </p>

      <h2>Contact</h2>
      <p>jazamehdi.pro@gmail.com</p>
    </main>
  );
}
