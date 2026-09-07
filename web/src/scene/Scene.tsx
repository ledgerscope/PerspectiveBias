import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { OrbitControls } from "@react-three/drei";
import { Desk } from "./Desk";
import { CubicleWall } from "./CubicleWall";
import { Paper } from "./Paper";
import { generateInitialLayout, TABLE_DIMENSIONS } from "./layout";
import { useInvoices } from "./useInvoices";
import { useResetOnSpace } from "./useResetOnSpace";
import { StatusOverlay } from "../components/StatusOverlay";

export function Scene() {
  const { invoices, mode, error } = useInvoices();
  const [heldId, setHeldId] = useState<string | null>(null);
  const resetToken = useResetOnSpace(() => setHeldId(null));

  const layouts = useMemo(() => generateInitialLayout(invoices), [invoices]);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <StatusOverlay mode={mode} error={error} invoiceCount={invoices.length} />
      <Canvas shadows camera={{ position: [0, 1.6, 1.7], fov: 55 }}>
        <color attach="background" args={["#20232a"]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[1.5, 3, 2]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Physics gravity={[0, -9.81, 0]}>
          <Desk />
          <CubicleWall />
          {layouts.map((layout) => (
            <Paper
              key={layout.id}
              layout={layout}
              heldId={heldId}
              onHold={setHeldId}
              resetToken={resetToken}
              tableHeight={TABLE_DIMENSIONS.height}
            />
          ))}
        </Physics>
        <OrbitControls
          enabled={!heldId}
          target={[0, TABLE_DIMENSIONS.height, 0]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={0.8}
          maxDistance={4}
        />
      </Canvas>
    </div>
  );
}
