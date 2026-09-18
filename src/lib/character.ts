// Constantes des personnages, partagées client/serveur (le module serveur
// est src/lib/characters.ts).

export const CHARACTER_VIDEOS_BUCKET = "character-videos";
export const MAX_CHARACTER_NAME_LENGTH = 60;

// Taille alignée avec le bucket character-videos ; Sora n'accepte que le MP4.
export const MAX_CHARACTER_VIDEO_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_CHARACTER_VIDEO_TYPES = ["video/mp4"];
