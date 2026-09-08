import { useMemo } from "react";
import { createPosterTexture, DEMOTIVATIONAL_SAYINGS } from "./textureUtils";
import { TABLE_DIMENSIONS } from "./layout";

const WALL_WIDTH = 5.2;
const WALL_HEIGHT = 2.6;
const POSTER_WIDTH = 0.5;
const POSTER_HEIGHT = 0.625;
const COLS = 6;
const COL_SPACING = 0.7;
const ROW_SPACING = 0.65;

/**
 * The cubicle wall behind the desk: a felt-grey partition covered entirely
 * in framed demotivational posters for morale (no more random placeholder
 * "photos" - just the gag posters, deterministically laid out in a grid).
 */
export function CubicleWall() {
  const wallZ = -(TABLE_DIMENSIONS.depth / 2 + 0.05);
  const wallY = TABLE_DIMENSIONS.height;
  // Keep the whole grid above the desk surface so the front row isn't
  // hidden behind the tabletop from the default camera angle.
  const gridBaseY = TABLE_DIMENSIONS.surfaceY + 0.3;

  const posters = useMemo(() => {
    const items: { x: number; y: number; rotation: number; text: string; key: number }[] = [];
    const count = DEMOTIVATIONAL_SAYINGS.length;
    const rows = Math.ceil(count / COLS);
    let i = 0;
    for (let row = 0; row < rows; row++) {
      const remaining = count - i;
      const colsInRow = Math.min(COLS, remaining);
      for (let col = 0; col < colsInRow; col++, i++) {
        // Deterministic small jitter per poster so the grid doesn't look
        // perfectly machine-aligned, using a cheap seeded sine hash.
        const jitterSeed = (i + 1) * 12.9898;
        const jitter = (Math.sin(jitterSeed) * 43758.5453) % 1;
        items.push({
          x: (col - (colsInRow - 1) / 2) * COL_SPACING + jitter * 0.04,
          y: gridBaseY + (rows - 1 - row) * ROW_SPACING,
          rotation: (jitter - 0.5) * 0.12,
          text: DEMOTIVATIONAL_SAYINGS[i],
          key: i,
        });
      }
    }
    return items;
  }, [gridBaseY]);

  return (
    <group>
      {/* Cubicle partition panel */}
      <mesh position={[0, wallY, wallZ]} receiveShadow>
        <boxGeometry args={[WALL_WIDTH, WALL_HEIGHT, 0.08]} />
        <meshStandardMaterial color="#9b9488" roughness={1} />
      </mesh>

      {posters.map((poster) => (
        <Poster
          key={poster.key}
          text={poster.text}
          position={[poster.x, poster.y, wallZ + 0.05]}
          rotation={poster.rotation}
        />
      ))}
    </group>
  );
}

function Poster({
  text,
  position,
  rotation,
}: {
  text: string;
  position: [number, number, number];
  rotation: number;
}) {
  const texture = useMemo(() => createPosterTexture(text), [text]);
  return (
    <mesh position={position} rotation={[0, 0, rotation]} castShadow>
      <planeGeometry args={[POSTER_WIDTH, POSTER_HEIGHT]} />
      <meshStandardMaterial map={texture} roughness={0.85} />
    </mesh>
  );
}
