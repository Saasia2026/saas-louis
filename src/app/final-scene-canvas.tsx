"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group, Mesh } from "three";

// La scène 3D de l'appel final : les formes obsidienne de l'œuvre de la page
// de connexion, vivantes — flottement lent, parallaxe à la souris, un ruban
// chrome qui accroche le reflet indigo. Chargée en différé par FinalScene.

// Position de repos, géométrie et matière de chaque forme ; le centre reste
// libre pour la typographie.
const SHAPES: {
  position: [number, number, number];
  scale: [number, number, number];
  kind: "pebble" | "monolith" | "ribbon";
}[] = [
  { position: [-3.4, 0.1, -1.2], scale: [0.55, 1.5, 0.55], kind: "monolith" },
  { position: [-2.3, -1.25, 0.2], scale: [0.7, 0.5, 0.7], kind: "pebble" },
  { position: [3.1, -0.9, -0.6], scale: [0.95, 0.75, 0.95], kind: "pebble" },
  { position: [2.5, 0.9, -1.8], scale: [0.45, 0.45, 0.45], kind: "ribbon" },
  { position: [-1.4, 1.35, -2.4], scale: [0.4, 0.32, 0.4], kind: "pebble" },
];

function Shapes() {
  const group = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    // Parallaxe amortie vers le curseur.
    g.rotation.y += (pointer.current.x * 0.2 - g.rotation.y) * 0.04;
    g.rotation.x += (pointer.current.y * 0.1 - g.rotation.x) * 0.04;
    g.children.forEach((child, i) => {
      const mesh = child as Mesh;
      mesh.position.y = SHAPES[i].position[1] + Math.sin(t * 0.45 + i * 1.9) * 0.12;
      mesh.rotation.y = t * 0.07 * (i % 2 ? 1 : -1);
      if (SHAPES[i].kind === "ribbon") mesh.rotation.x = t * 0.12;
    });
  });

  return (
    <group ref={group}>
      {SHAPES.map((shape, i) => (
        <mesh key={i} position={shape.position} scale={shape.scale}>
          {shape.kind === "monolith" ? (
            <capsuleGeometry args={[0.5, 1.1, 8, 24]} />
          ) : shape.kind === "ribbon" ? (
            <torusKnotGeometry args={[1, 0.28, 220, 24]} />
          ) : (
            <sphereGeometry args={[1, 48, 48]} />
          )}
          {shape.kind === "ribbon" ? (
            <meshStandardMaterial color="#c9c9d4" metalness={1} roughness={0.18} />
          ) : (
            <meshStandardMaterial color="#131316" metalness={0.1} roughness={0.85} />
          )}
        </mesh>
      ))}
    </group>
  );
}

export default function FinalSceneCanvas({ running }: { running: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 6], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={running ? "always" : "never"}
    >
      <ambientLight intensity={0.35} />
      {/* Lumière clé blanche douce, et deux indigo en contre pour les reflets. */}
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <pointLight position={[-7, 2, 3]} intensity={60} color="#5e6cf2" />
      <pointLight position={[6, -3, 2]} intensity={25} color="#8b95ff" />
      <Shapes />
    </Canvas>
  );
}
