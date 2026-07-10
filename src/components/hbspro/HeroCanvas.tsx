import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Points, PointMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function DataField() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(2200 * 3);
    for (let i = 0; i < arr.length; i += 3) {
      const radius = 3.5 + Math.random() * 7.5;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 5;
      arr[i] = Math.cos(theta) * radius;
      arr[i + 1] = y;
      arr[i + 2] = Math.sin(theta) * radius - 1.5;
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.018;
    ref.current.rotation.x = Math.sin(Date.now() * 0.00018) * 0.05;
  });

  return (
    <Points ref={ref} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#E8D9A6"
        size={0.025}
        sizeAttenuation
        depthWrite={false}
        opacity={0.64}
      />
    </Points>
  );
}

function EmeraldNebula() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(1100 * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = (Math.random() - 0.5) * 14;
      arr[i + 1] = (Math.random() - 0.5) * 8;
      arr[i + 2] = (Math.random() - 0.5) * 8;
    }
    return arr;
  }, []);

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y -= dt * 0.012;
  });

  return (
    <Points ref={ref} positions={positions} stride={3}>
      <PointMaterial
        transparent
        color="#0d7a5f"
        size={0.035}
        sizeAttenuation
        depthWrite={false}
        opacity={0.42}
      />
    </Points>
  );
}

function OrbitalRings() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.16;
    group.current.rotation.z += dt * 0.035;
  });

  return (
    <Float speed={1.15} rotationIntensity={0.28} floatIntensity={0.55}>
      <group ref={group} rotation={[0.34, 0.2, -0.16]}>
        <mesh>
          <torusGeometry args={[2.6, 0.018, 18, 220]} />
          <meshBasicMaterial color="#C5A059" transparent opacity={0.85} />
        </mesh>
        <mesh rotation={[Math.PI / 2.7, 0, 0]}>
          <torusGeometry args={[3.05, 0.012, 18, 220]} />
          <meshBasicMaterial color="#E8D9A6" transparent opacity={0.44} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2.4, 0]}>
          <torusGeometry args={[2.22, 0.012, 18, 220]} />
          <meshBasicMaterial color="#0d7a5f" transparent opacity={0.72} />
        </mesh>
      </group>
    </Float>
  );
}

function CommandCore() {
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.22;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.08;
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[0.78, 2]} />
        <meshStandardMaterial
          color="#0d7a5f"
          emissive="#064e3b"
          emissiveIntensity={0.45}
          roughness={0.34}
          metalness={0.55}
        />
      </mesh>
      <mesh scale={1.22}>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshBasicMaterial color="#C5A059" wireframe transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function CityGrid() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.025;
  });

  const blocks = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 7,
        z: (Math.random() - 0.5) * 4.5,
        h: 0.08 + Math.random() * 0.5,
      })),
    [],
  );

  return (
    <group ref={ref} position={[0, -1.55, -0.8]} rotation={[0.08, 0, 0]}>
      <gridHelper args={[8, 18, "#C5A059", "#0d7a5f"]} />
      {blocks.map((b) => (
        <mesh key={b.id} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[0.08, b.h, 0.08]} />
          <meshStandardMaterial color="#C5A059" emissive="#C5A059" emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroCanvas() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.25, 6], fov: 58 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      className="!absolute !inset-0"
    >
      <color attach="background" args={["#031f17"]} />
      <fog attach="fog" args={["#031f17", 5.5, 14]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[3.5, 3.5, 4]} intensity={1.7} color="#C5A059" />
      <pointLight position={[-4, -1, 3]} intensity={1.1} color="#0d7a5f" />
      <DataField />
      <EmeraldNebula />
      <CityGrid />
      <OrbitalRings />
      <CommandCore />
    </Canvas>
  );
}
