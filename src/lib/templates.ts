// Modèles de vidéo, partagés client/serveur. Un modèle préremplit le
// formulaire (format, durée, exemple de demande) et donne au storyboard une
// direction de réalisation (`direction`, en anglais, voir writeStoryboard).

import type { AspectRatio } from "@/lib/generation";

export type VideoTemplate = {
  id: string;
  label: string;
  hint: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  placeholder: string;
  direction: string;
};

export const FREE_TEMPLATE_ID = "free";

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: FREE_TEMPLATE_ID,
    label: "Libre",
    hint: "Ton idée, sans cadre",
    aspectRatio: "9:16",
    durationSeconds: 15,
    placeholder:
      "Ex. : une journée à Paris : café en terrasse le matin, balade le long de la Seine, coucher de soleil au Trocadéro. Tenue streetwear noire.",
    direction: "",
  },
  {
    id: "ugc-ad",
    label: "Pub UGC",
    hint: "Produit recommandé face caméra",
    aspectRatio: "9:16",
    durationSeconds: 15,
    placeholder:
      "Ex. : ma nouvelle gourde isotherme vert sauge, je l'emmène à la salle et au bureau. Tenue sport décontractée.",
    direction:
      "Authentic user-generated ad filmed on a smartphone, handheld feel, natural home or everyday lighting. Structure: 1) hook: the creator looks straight into the camera, surprised or excited, holding the product; 2) the product shown up close in the creator's hands; 3) the creator using the product in a real-life situation; 4) the creator's genuine reaction, smiling at the camera; 5) closing shot: the creator holds the product next to their face and nods at the camera. The product is described with the exact same words in every shot.",
  },
  {
    id: "product-showcase",
    label: "Produit premium",
    hint: "Mise en valeur haut de gamme",
    aspectRatio: "1:1",
    durationSeconds: 15,
    placeholder: "Ex. : une montre automatique au cadran bleu nuit et bracelet cuir marron.",
    direction:
      "Premium commercial with a luxury brand look: studio or elegant interior, soft directional light, shallow depth of field, slow and smooth camera moves. Alternate close-ups where the product fills the frame (still held or worn by the creator) and medium shots of the creator presenting it with confidence. The product is described with the exact same words in every shot.",
  },
  {
    id: "travel-vlog",
    label: "Vlog voyage",
    hint: "Carnet de voyage dynamique",
    aspectRatio: "9:16",
    durationSeconds: 20,
    placeholder: "Ex. : trois jours à Lisbonne : tram jaune, miradouro au coucher du soleil, pastéis de nata.",
    direction:
      "Travel vlog with warm, sunny colour grading and a sense of discovery. Open with the creator arriving at the destination, then iconic places and local experiences, and end at golden hour with the creator smiling at the camera. Each shot is in a different recognisable location of the destination.",
  },
  {
    id: "day-in-my-life",
    label: "Day in my life",
    hint: "Une journée, du matin au soir",
    aspectRatio: "9:16",
    durationSeconds: 30,
    placeholder: "Ex. : ma journée d'entrepreneur : réveil, café, réunions, sport, dîner entre amis.",
    direction:
      "Aesthetic 'day in my life' lifestyle video in chronological order from morning to night, with the light following the time of day (soft morning light, bright daylight, warm evening lamps). Cosy, aspirational and relatable moments, each one a small everyday ritual.",
  },
  {
    id: "expert",
    label: "Expert / coach",
    hint: "Personal branding pro",
    aspectRatio: "16:9",
    durationSeconds: 15,
    placeholder: "Ex. : coach en finances personnelles, je présente ma nouvelle formation en ligne. Costume bleu marine.",
    direction:
      "Personal branding video for an expert: clean modern office, stage or studio settings, professional yet warm lighting. The creator looks confident and approachable: speaking to camera, explaining at a whiteboard or on stage, working at a desk, and a closing shot facing the camera with a slight smile.",
  },
  {
    id: "fashion",
    label: "Lookbook mode",
    hint: "Tenues et poses éditoriales",
    aspectRatio: "9:16",
    durationSeconds: 15,
    placeholder: "Ex. : look automne en ville : trench beige, pull en maille crème, bottines marron.",
    direction:
      "Editorial fashion lookbook: stylish urban or minimalist backdrops, magazine-style lighting, confident poses. The outfit is the hero: alternate medium shots that show the full outfit from the knees up with close-ups on details and the creator's face. Movement is slow and graceful (a turn of the shoulders, a few steps towards the camera).",
  },
  {
    id: "trailer",
    label: "Bande-annonce",
    hint: "Teaser façon cinéma",
    aspectRatio: "16:9",
    durationSeconds: 15,
    placeholder: "Ex. : je lance mon podcast sur l'aventure : montagne, tempête, sommet au lever du soleil.",
    direction:
      "Cinematic movie-trailer teaser: dramatic contrasted lighting, anamorphic widescreen look, rich colour grading, rising tension from shot to shot. Open on an intriguing atmosphere, build up with intense moments, and end on a powerful hero shot of the creator facing the camera.",
  },
];

export function findTemplate(id: unknown) {
  return VIDEO_TEMPLATES.find((t) => t.id === id);
}
