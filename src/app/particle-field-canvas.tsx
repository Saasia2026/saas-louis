"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, type Group } from "three";

// Champ de particules du fond de page : une nappe de points fins qui dérive
// lentement, suit un peu la souris et glisse avec le défilement. Deux
// couches : la poussière blanche discrète, et quelques accents indigo.

const SPREAD: [number, number, number] = [26, 16, 12];

function makePositions(count: number) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * SPREAD[0];
    positions[i + 1] = (Math.random() - 0.5) * SPREAD[1];
    positions[i + 2] = (Math.random() - 0.5) * SPREAD[2];
  }
  return positions;
}

function Field() {
  const group = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const dust = useMemo(() => makePositions(2000), []);
  const sparks = useMemo(() => makePositions(180), []);

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
    // Dérive lente + parallaxe amortie vers le curseur.
    g.rotation.y += (t * 0.012 + pointer.current.x * 0.1 - g.rotation.y) * 0.05;
    g.rotation.x += (pointer.current.y * 0.05 - g.rotation.x) * 0.05;
    // Le champ glisse doucement avec le défilement (parallaxe de fond).
    g.position.y += (window.scrollY * 0.0012 - g.position.y) * 0.08;
  });

  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#9a9aa8"
          size={0.02}
          sizeAttenuation
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparks, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#8b95ff"
          size={0.045}
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default function ParticleFieldCanvas() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8], fov: 60 }} gl={{ antialias: false, alpha: true }}>
      <Field />
    </Canvas>
  );
}
