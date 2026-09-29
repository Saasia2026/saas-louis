// Fond de particules du site : une trame SVG statique (public/particles.svg)
// qui dérive par transformation compositée — zéro JavaScript, zéro boucle de
// rendu, aucun contexte WebGL à créer ou détruire entre les pages. La
// version Three.js faisait accrocher les machines modestes à chaque
// navigation ; celle-ci ne coûte rien. Style et coupure « animations
// réduites » dans globals.css (.particle-field).
export function ParticleField({ subtle = false }: { subtle?: boolean }) {
  return <div aria-hidden className={`particle-field ${subtle ? "opacity-60" : ""}`} />;
}
