import { redirect } from "next/navigation";

// Pas de page d'accueil pour l'instant : l'espace connecté s'ouvre sur la
// génération.
export default function DashboardPage() {
  redirect("/dashboard/generate");
}
