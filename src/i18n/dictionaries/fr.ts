// Textes du site en français : la référence. en.ts et es.ts suivent
// exactement la même structure (vérifiée par le type Dictionary).
// Les {variables} sont remplacées par fmt() (voir i18n/config.ts).

export const fr = {
  meta: {
    description:
      "Mets ton personnage dans n'importe quelle vidéo : TwinPost remplace la personne d'un clip filmé en gardant ses gestes, le décor, la caméra et le son.",
    login: "Connexion",
    studio: "Studio",
    videos: "Mes vidéos",
    credits: "Crédits",
  },

  common: {
    credit: "crédit",
    credits: "crédits",
    signOut: "Déconnexion",
    language: "Langue",
    theme: "Thème",
    themeLight: "Mode clair",
    themeDark: "Mode sombre",
    sessionExpired: "Session expirée, reconnecte-toi.",
  },

  shell: {
    newVideo: "Nouvelle vidéo",
    workspace: "Espace de travail",
    recharge: "Recharger",
    nav: { studio: "Studio", videos: "Mes vidéos", credits: "Crédits" },
  },

  landing: {
    features: "Fonctionnalités",
    pricing: "Tarifs",
    openStudio: "Ouvrir le studio",
    studioShort: "Studio",
    start: "Commencer",
    eyebrow: "Remplacement de personnage par IA · dans de vraies vidéos",
    titleTop: "Ton personnage.",
    titleBottom: "Dans la vidéo.",
    subtitle:
      "Dépose un clip filmé et la photo d'un personnage : il prend la place de la personne, avec ses gestes, le décor, la caméra et le son d'origine.",
    ctaFirst: "Remplacer mon premier personnage",
    ctaPricing: "Voir les tarifs",
    perks: ["Une seule photo suffit", "Sans abonnement", "Crédits rendus en cas d'échec"],
    mockWindow: "twinpost · Studio",
    mockRendering: "Remplacement en cours",
    mockClip: "Clip filmé",
    mockClipMeta: "12 s · 3 plans",
    mockCharacter: "Personnage",
    mockCharacterMeta: "1 photo",
    mockTarget: "Remplacer : le combattant en short noir",
    mockEngine: "Qualité max",
    mockPipeline: "Remplacement · 4 étapes",
    mockSteps: [
      "Fiche du personnage, de face et de trois quarts",
      "Gestes, caméra et coupes repris du clip",
      "Le personnage prend la place de la personne",
      "Montage sur le son d'origine",
    ],
    mockBadge: "720p · 12 s",
    models: [
      "Genjutsu",
      "Kling O3",
      "Nano Banana Pro",
      "Son d'origine gardé",
      "Coupes respectées",
      "Jusqu'à 90 s",
    ],
    featuresTitle: "Le vrai mouvement. Ton personnage.",
    featureList: [
      {
        title: "Le mouvement vient du vrai",
        text: "Gestes, regards, caméra, décor et lumière sont repris de ton clip. Rien à décrire : ce qui est filmé est rejoué par ton personnage.",
      },
      {
        title: "Une photo suffit",
        text: "À partir d'une seule image, TwinPost prépare la fiche du personnage pour qu'il reste le même d'un plan à l'autre.",
      },
      { title: "Le son d'origine", text: "Voix, musique et ambiance du clip sont gardées telles quelles." },
      {
        title: "Les coupes respectées",
        text: "Un clip monté reste monté : jusqu'à 90 s, avec ses changements de plan.",
      },
      { title: "Zéro risque", text: "Un remplacement qui échoue te rend automatiquement ses crédits." },
    ],
    noSubscription: "d'abonnement. Les crédits n'expirent pas.",
    howItWorks: "Comment ça marche",
    steps: [
      {
        title: "Tu déposes ton clip",
        text: "Une vidéo filmée, jusqu'à 90 s : une danse, un sketch, un combat, une scène culte. La personne à remplacer doit être bien visible.",
      },
      {
        title: "Tu ajoutes ton personnage",
        text: "Une photo nette, de face, en entier : un animal, une mascotte, une créature ou toi-même. S'il y a plusieurs personnes, tu dis laquelle remplacer.",
      },
      {
        title: "Il prend sa place",
        text: "En quelques minutes, ton personnage rejoue la scène à la place de la personne. Tu télécharges la vidéo, prête à publier.",
      },
    ],
    pricingTitle: "Des crédits, sans abonnement",
    pricingText:
      "Qualité max : {max} crédits la seconde. Économique : {budget} crédits la seconde. Plus {sheet} crédits par vidéo pour la fiche du personnage.",
    popular: "Populaire",
    perCredit: "le crédit",
    finalTitleTop: "Ta prochaine vidéo",
    finalTitleBottom: "commence par un clip.",
    startFree: "Créer mon compte",
  },

  login: {
    welcome: "Bienvenue dans le studio",
    tagline: "Mets ton personnage dans n'importe quelle vidéo.",
    signIn: "Connexion",
    signUp: "Inscription",
    email: "Email",
    password: "Mot de passe",
    wait: "Un instant…",
    submitSignIn: "Se connecter",
    submitSignUp: "Créer mon compte",
    freeCredits: "3 crédits offerts à l'inscription",
    invalidLink: "Ce lien de confirmation est invalide ou a expiré.",
    errors: {
      missing: "Email et mot de passe requis.",
      notConfirmed: "Confirme ton email avant de te connecter.",
      wrong: "Email ou mot de passe incorrect.",
      tooShort: "Le mot de passe doit faire au moins {min} caractères.",
      weak: "Mot de passe trop faible.",
      signUpFailed: "Inscription impossible. Réessaie dans un instant.",
    },
    created: "Compte créé ! Clique sur le lien reçu par email pour l'activer.",
  },

  studio: {
    title: "Qui met-on dans la vidéo ?",
    subtitle:
      "Dépose un clip filmé et l'image d'un personnage : il prend la place de la personne, avec ses gestes, le décor, la caméra et le son.",
    steps: ["Un clip filmé", "Une image du personnage", "Il prend sa place"],
    video: "Clip à reprendre",
    videoHint: "MP4, MOV ou WebM · {max} s gardées · une personne bien visible",
    segment: "Passage gardé ({max} s)",
    target: "Qui remplacer ?",
    targetPlaceholder: "Qui remplacer ? ex. : le combattant en short noir (facultatif)",
    image: "Personnage",
    imageHint: "Personnage en entier, de face, net, sur fond uni : il gardera cette allure",
    uploading: "Envoi…",
    change: "Changer",
    pick: "Ajoute un clip et un personnage",
    explain:
      "Les gestes, le décor, la caméra et le son viennent de ton clip : seul le personnage change. Utilise un clip que tu as le droit de réutiliser.",
    launch: "Remplacer",
    costFrom: "Dès {cost} {credits}",
    notEnoughCredits: "Crédits insuffisants",
    keyframes: "Personnage placé sur chaque plan",
    shots: "Tournage et vérification des plans",
    swapping: "Remplacement du personnage…",
    genjutsuHint: "Environ {minutes} min · tu retrouveras la vidéo dans Mes vidéos",
    progressHint: "Quelques minutes · tu retrouveras la vidéo dans Mes vidéos",
    assembling: "Montage de la vidéo…",
    redoTitle: "Un plan raté ? Refais-le seul :",
    shot: "Plan {n}",
    shotFlagged: "À vérifier",
    redo: "Refaire le plan {n} · {cost} {credits}",
    sequences: "Séquences rendues",
    sequence: "Séquence {n}",
    redoSequenceTitle: "Une séquence ratée ? Refais-la seule :",
    redoSequence: "Refaire la séquence {n} · {cost} {credits}",
    tryBudget: "Relancer en Économique",
    length: "Durée",
    lengthAll: "Tout le clip ({seconds} s)",
    download: "Télécharger",
    newVideo: "Nouvelle vidéo",
    failed: "Le remplacement a échoué. Tes crédits ont été rendus.",
    tooLong: "C'est plus long que prévu. Reviens dans quelques minutes : la vidéo sera dans Mes vidéos.",
  },

  swapEngines: {
    genjutsu: {
      label: "Qualité max",
      hint: "Genjutsu · {rate} crédits/s · jusqu'à {max} s, coupes comprises, séquences refaisables",
    },
    kling: {
      label: "Économique",
      hint: "Kling · {rate} crédits/s · jusqu'à {max} s, plans refaisables un par un",
    },
  },

  videos: {
    eyebrow: "Bibliothèque",
    title: "Mes vidéos",
    intro: "Tes remplacements terminés, du plus récent au plus ancien.",
    empty: "Aucune vidéo pour l'instant. Dépose un clip et un personnage dans le studio.",
    goStudio: "Aller au studio",
    running: "En cours…",
    resume: "Suivre dans le studio",
    download: "Télécharger",
    seconds: "{seconds} s",
  },

  generateErrors: {
    insufficientCredits: "Pas assez de crédits. Recharge-les depuis la page Crédits.",
    outOfCredit: "Le compte du service de génération n'a plus de crédit. Tes crédits ont été rendus.",
    genjutsuUnavailable:
      "Le moteur Qualité max est momentanément indisponible. Tes crédits ont été rendus : relance en Économique ou réessaie plus tard.",
    swapTooShort: "Le passage doit durer au moins {min} s.",
    swapRedoUnavailable: "Ce plan ne peut pas être refait.",
    swapFiles: "Ajoute un clip et une image de personnage.",
    swapUnreadable: "Impossible de lire ce clip. Essaie un MP4.",
    swapFormat: "Format non pris en charge.",
    swapTooBig: "Fichier trop lourd (50 Mo max).",
    swapUpload: "L'envoi du fichier a échoué.",
    contentRefused:
      "Le modèle vidéo a refusé ce clip ou ce personnage (filtre de contenu). Tes crédits ont été rendus : essaie un autre passage ou une autre image.",
    rateLimited:
      "Le service de génération est saturé, réessaie dans quelques secondes. Tes crédits ont été rendus.",
    startFailed: "Le remplacement n'a pas pu démarrer. Tes crédits ont été rendus.",
    notFound: "Vidéo introuvable.",
  },

  creditsPage: {
    eyebrow: "Facturation",
    title: "Crédits",
    intro:
      "Qualité max : {max} crédits la seconde. Économique : {budget} crédits la seconde. Plus {sheet} crédits par vidéo pour la fiche du personnage. Paie seulement ce que tu utilises, sans abonnement.",
    balance: "Solde actuel",
    secure: "Paiement sécurisé par Stripe",
    popular: "Populaire",
    creditsRow: "Crédits",
    perCreditRow: "Prix du crédit",
    secondsMaxRow: "Secondes en Qualité max",
    secondsBudgetRow: "Secondes en Économique",
    buy: "Acheter",
    footer: "Les crédits n'expirent pas. Un remplacement qui échoue te rend ses crédits.",
    packs: { starter: "Découverte", creator: "Créateur", studio: "Studio" },
    productName: "TwinPost · {credits} crédits ({label})",
    notices: {
      paid: "Paiement reçu, tes crédits ont été ajoutés. Merci !",
      pending: "Paiement en cours de validation : tes crédits arriveront dès qu'il sera confirmé.",
      mismatch: "Ce paiement ne correspond pas à ton compte.",
      verifyFailed:
        "Impossible de vérifier le paiement pour l'instant. S'il a abouti, tes crédits arriveront automatiquement.",
      unavailable: "Le paiement n'est pas encore disponible.",
      checkout: "La page de paiement n'a pas pu s'ouvrir. Réessaie dans un instant.",
    },
  },
};

export type Dictionary = typeof fr;
