import { useMemo } from "react";
import { createPlaceholderPhotoTexture } from "./textureUtils";
import { TABLE_DIMENSIONS } from "./layout";

const WALL_WIDTH = 5.2;
const WALL_HEIGHT = 2.6;
const GRID_COLS = 6;
const GRID_ROWS = 3;
const PHOTO_SIZE = 0.42;

/**
 * The cubicle wall behind the desk: a felt-grey partition covered with a
 * grid of randomly-generated "photo" placeholders (polaroid-style frames).
 * Swap `createPlaceholderPhotoTexture` for real loaded images from
 * `public/wall-images` when actual team photos are available.
 */
export function CubicleWall() {
  const wallZ = -(TABLE_DIMENSIONS.depth / 2 + 0.05);
  const wallY = TABLE_DIMENSIONS.height;

  const photos = useMemo(() => {
    const items: { x: number; y: number; rotation: number; seed: number }[] = [];
    let seed = 7;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        seed += 1;
        const jitterSeed = seed * 12.9898;
        const jitter = (Math.sin(jitterSeed) * 43758.5453) % 1;
        items.push({
          x: (col - (GRID_COLS - 1) / 2) * (PHOTO_SIZE + 0.12) + jitter * 0.05,
          y: (row - (GRID_ROWS - 1) / 2) * (PHOTO_SIZE + 0.12) + wallY * 0.4,
          rotation: (jitter - 0.5) * 0.35,
          seed,
        });
      }
    }
    return items;
  }, [wallY]);

  return (
    <group>
      {/* Cubicle partition panel */}
      <mesh position={[0, wallY, wallZ]} receiveShadow>
        <boxGeometry args={[WALL_WIDTH, WALL_HEIGHT, 0.08]} />
        <meshStandardMaterial color="#9b9488" roughness={1} />
      </mesh>

      {photos.map((p) => (
        <PolaroidPhoto key={p.seed} seed={p.seed} position={[p.x, p.y, wallZ + 0.05]} rotation={p.rotation} />
      ))}
    </group>
  );
}

function PolaroidPhoto({
  seed,
  position,
  rotation,
}: {
  seed: number;
  position: [number, number, number];
  rotation: number;
}) {
  const texture = useMemo(() => createPlaceholderPhotoTexture(seed), [seed]);
  return (
    <mesh position={position} rotation={[0, 0, rotation]} castShadow>
      <planeGeometry args={[PHOTO_SIZE, PHOTO_SIZE]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}
