"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Html } from "@react-three/drei";
import { useRef } from "react";
import type { Group } from "three";
import { DashboardMock } from "./DashboardMock";

function Rig() {
  const group = useRef<Group>(null);
  useFrame(({ pointer }) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += (pointer.x * 0.35 - 0.25 - g.rotation.y) * 0.06;
    g.rotation.x += (-pointer.y * 0.2 - g.rotation.x) * 0.06;
  });
  return (
    <group ref={group}>
      <Html transform distanceFactor={1.6} position={[0, 0, 0]}>
        <DashboardMock />
      </Html>
      <Float speed={1.4} floatIntensity={1.2}>
        <Html transform distanceFactor={1.6} position={[1.9, 0.9, 0.6]}>
          <div className="glass whitespace-nowrap px-3 py-2 text-xs">Order #1042 paid, $128.00</div>
        </Html>
      </Float>
      <Float speed={1.8} floatIntensity={1.5}>
        <Html transform distanceFactor={1.6} position={[-1.9, -0.8, 0.8]}>
          <div className="glass whitespace-nowrap px-3 py-2 text-xs">
            Low stock: Linen Overshirt (M), 4 left
          </div>
        </Html>
      </Float>
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 1.75]}>
      <Rig />
    </Canvas>
  );
}
