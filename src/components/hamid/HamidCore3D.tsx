import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * Hamid neon energy core — pulsating 3D sphere that reacts to voice state.
 * Renders inside a fixed-size wrapper. Fully client-only (Three.js).
 */

type State = {
  active: boolean;
  listening: boolean;
  speaking: boolean;
};

function ParticleField() {
  const ref = useRef<THREE.Points>(null);
  // 400 points on a sphere shell
  const positions = useRefInit(() => {
    const arr = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      const r = 2.2 + Math.random() * 0.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  });
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.15;
      ref.current.rotation.x += dt * 0.05;
    }
  });
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#58a6ff"
        size={0.045}
        sizeAttenuation
        depthWrite={false}
        opacity={0.85}
      />
    </Points>
  );
}

function Core({ active, listening, speaking }: State) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<any>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state, dt) => {
    const t = state.clock.getElapsedTime();
    // base pulse
    const basePulse = 1 + Math.sin(t * 2) * 0.04;
    const talkBoost = speaking ? 0.12 + Math.abs(Math.sin(t * 12)) * 0.08 : 0;
    const listenBoost = listening ? 0.06 + Math.abs(Math.sin(t * 6)) * 0.04 : 0;
    const scale = basePulse + talkBoost + listenBoost;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(scale);
      meshRef.current.rotation.y += dt * (speaking ? 0.9 : listening ? 0.5 : 0.18);
      meshRef.current.rotation.x += dt * 0.08;
    }
    if (matRef.current) {
      matRef.current.distort = speaking ? 0.55 : listening ? 0.4 : 0.28;
      matRef.current.speed = speaking ? 4 : listening ? 2.5 : 1.2;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += dt * (speaking ? 1.8 : 0.6);
      const s = 1 + Math.sin(t * 3) * 0.05;
      ringRef.current.scale.setScalar(s);
    }
  });

  const coreColor = speaking ? "#7ee7ff" : listening ? "#58a6ff" : active ? "#3b82f6" : "#2f6bd6";

  return (
    <group>
      {/* Outer ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[1.8, 0.02, 16, 128]} />
        <meshBasicMaterial color="#58a6ff" transparent opacity={0.5} />
      </mesh>
      {/* Distorted energy sphere */}
      <Sphere ref={meshRef} args={[1.1, 96, 96]}>
        <MeshDistortMaterial
          ref={matRef}
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={speaking ? 1.4 : listening ? 1.0 : 0.7}
          roughness={0.15}
          metalness={0.6}
          distort={0.28}
          speed={1.2}
        />
      </Sphere>
      {/* Inner white-hot core */}
      <mesh>
        <sphereGeometry args={[0.35, 32, 32]} />
        <meshBasicMaterial color="#eaf6ff" transparent opacity={0.9} />
      </mesh>
      <ParticleField />
    </group>
  );
}

// Tiny helper to memoize initial value without pulling useMemo dep types
function useRefInit<T>(init: () => T): T {
  const r = useRef<T | null>(null);
  if (r.current === null) r.current = init();
  return r.current;
}

export function HamidCore3D({
  size = 220,
  active = false,
  listening = false,
  speaking = false,
}: {
  size?: number;
  active?: boolean;
  listening?: boolean;
  speaking?: boolean;
}) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Neon halo behind canvas */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full blur-2xl transition-opacity duration-500"
        style={{
          opacity: speaking ? 0.95 : listening ? 0.75 : active ? 0.55 : 0.35,
          background:
            "radial-gradient(circle at 50% 50%, rgba(88,166,255,0.85) 0%, rgba(59,130,246,0.55) 35%, rgba(15,23,42,0) 72%)",
        }}
      />
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[3, 3, 4]} intensity={1.4} color="#58a6ff" />
        <pointLight position={[-3, -2, 2]} intensity={0.9} color="#7ee7ff" />
        <Core active={active} listening={listening} speaking={speaking} />
      </Canvas>
    </div>
  );
}
