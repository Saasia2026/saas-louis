// Démos du studio (public/examples et public/demos), avec leur format. La
// première ouvre l'onglet Exemples, les autres font la mosaïque, et toutes se
// retrouvent dans le fil façon reels. `sound` : seules certaines ont du son.
export type DemoClip = { base: string; ratio: string; sound?: boolean };

const example = (name: string, ratio: string, sound = false): DemoClip => ({
  base: `/examples/${name}`,
  ratio,
  sound,
});

const gallery = (n: number, ratio = "9/16", sound = false) => example(`gallery/g-${String(n).padStart(2, "0")}`, ratio, sound);

const wall = (n: number, ratio = "16/9"): DemoClip => ({ base: `/demos/demo-${String(n).padStart(2, "0")}`, ratio });

export const DEMO_CLIPS: DemoClip[] = [
  example("genjutsu-salle", "16/9"),
  gallery(22, "4/3", true),
  gallery(23, "752/1224", true),
  gallery(24, "9/16", true),
  gallery(25, "9/16", true),
  gallery(26, "9/16", true),
  gallery(27, "9/16", true),
  gallery(1),
  gallery(2, "3/4"),
  gallery(3),
  gallery(4),
  gallery(5),
  gallery(6),
  gallery(7),
  gallery(8),
  gallery(9),
  gallery(10),
  gallery(11),
  gallery(12),
  gallery(13),
  gallery(14),
  gallery(15),
  gallery(16),
  gallery(17),
  gallery(18, "3/4"),
  gallery(19),
  gallery(20),
  gallery(21),
  example("genjutsu-cage", "9/16"),
  example("genjutsu-danse", "9/16"),
  example("genjutsu-dunk", "9/16"),
  example("genjutsu-bras-de-fer", "1/1"),
  example("genjutsu-diable", "9/16"),
  example("genjutsu-camion", "4/3"),
  example("genjutsu-lincoln", "9/16"),
  example("genjutsu-panier", "3/4"),
  example("mma-apres", "9/16"),
  example("micro-apres", "9/16"),
  wall(3, "9/16"),
  wall(10, "9/16"),
  wall(12, "9/16"),
  wall(1),
  wall(2),
  wall(4),
  wall(9),
  wall(11),
  wall(17),
  wall(18),
  wall(19),
  wall(20),
];
