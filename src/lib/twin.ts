// Règles d'upload des photos d'entraînement, partagées client/serveur.
// MAX_PHOTOS et MAX_PHOTO_BYTES doivent rester alignés avec la base
// (policy "training_photos: ajout" et bucket training-photos).

export const MIN_PHOTOS = 20;
export const MAX_PHOTOS = 30;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const TRAINING_PHOTOS_BUCKET = "training-photos";
export const TWIN_MODELS_BUCKET = "twin-models";

// Modèle 3D d'un jumeau : null tant qu'il n'est pas lancé.
export type TwinModelStatus = "image" | "mesh" | "ready" | "failed" | null;

export type TwinModelView = {
  status: TwinModelStatus;
  modelUrl?: string;
  imageUrl?: string;
};

export type TrainingPhoto = {
  id: string;
  fileName: string;
  storagePath: string;
  url: string | null;
};

export const MAX_TWIN_NAME_LENGTH = 40;
