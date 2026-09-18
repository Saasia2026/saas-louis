import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { FORMATS, type AspectRatio } from "@/lib/generation";

const execFileAsync = promisify(execFile);

// Durée et format d'un clip, lus par ffmpeg sur son URL signée : le débit des
// crédits se fonde sur cette mesure, pas sur celle annoncée par le navigateur.
export async function probeVideo(url: string) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  // Sans fichier de sortie, ffmpeg décrit l'entrée puis sort en erreur : la
  // description est dans stderr dans les deux cas.
  const stderr = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", url], {
    timeout: 30_000,
  }).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? "",
  );

  const duration = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const size = stderr.match(/Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})[ ,[]/);
  if (!duration || !size) return null;

  const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  let width = Number(size[1]);
  let height = Number(size[2]);
  // Vidéos de téléphone : l'image est stockée couchée, avec une rotation.
  if (/rotation of -?90|rotate\s*:\s*-?(90|270)/.test(stderr)) {
    [width, height] = [height, width];
  }
  return { seconds, aspectRatio: nearestFormat(width / height) };
}

function nearestFormat(ratio: number): AspectRatio {
  const value = (f: AspectRatio) => {
    const [w, h] = f.split(":").map(Number);
    return w / h;
  };
  return FORMATS.map((f) => f.value).reduce((best, f) =>
    Math.abs(Math.log(value(f) / ratio)) < Math.abs(Math.log(value(best) / ratio)) ? f : best,
  );
}
