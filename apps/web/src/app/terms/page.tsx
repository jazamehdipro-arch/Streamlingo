export const metadata = { title: "Conditions d'utilisation — StreamLingo" };

export default function TermsPage() {
  return (
    <main className="legal mx-auto max-w-2xl px-6 py-12">
      <h1>Conditions d&apos;utilisation</h1>
      <p className="text-sm text-neutral-400">Dernière mise à jour : juillet 2026</p>

      <h2>Le service</h2>
      <p>
        StreamLingo fournit des outils d&apos;apprentissage des langues à partir de contenus vidéo
        et audio que vous choisissez : traduction de vocabulaire, quiz, flashcards à répétition
        espacée. StreamLingo n&apos;héberge aucun contenu vidéo : les vidéos restent lues par
        YouTube via son lecteur officiel.
      </p>

      <h2>Compte</h2>
      <p>
        Vous êtes responsable de la confidentialité de vos identifiants. Un compte est personnel et
        ne doit pas être partagé.
      </p>

      <h2>Plans et paiement</h2>
      <ul>
        <li>Le plan gratuit inclut un quota mensuel d&apos;analyse limité.</li>
        <li>
          Le plan Pro est un abonnement (mensuel ou annuel) géré par Stripe, annulable à tout
          moment depuis le portail de gestion — l&apos;accès Pro reste actif jusqu&apos;à la fin de
          la période payée.
        </li>
        <li>
          L&apos;usage « illimité » du plan Pro est soumis à une limite d&apos;usage équitable
          destinée à prévenir les abus automatisés.
        </li>
      </ul>

      <h2>Usage acceptable</h2>
      <p>
        Il est interdit d&apos;utiliser le service pour extraire massivement des contenus, de
        revendre l&apos;accès, ou de contourner les limites techniques du service.
      </p>

      <h2>Disponibilité et responsabilité</h2>
      <p>
        Le service dépend de plateformes tierces (YouTube, fournisseurs d&apos;IA) dont les
        évolutions peuvent affecter certaines fonctionnalités. Le service est fourni « en
        l&apos;état » ; notre responsabilité est limitée au montant payé sur les 12 derniers mois.
      </p>

      <h2>Contact</h2>
      <p>jazamehdi.pro@gmail.com</p>
    </main>
  );
}
