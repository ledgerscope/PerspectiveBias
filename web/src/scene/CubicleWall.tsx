import { useMemo } from "react";
import { createPlaceholderPhotoTexture, createPosterTexture, DEMOTIVATIONAL_SAYINGS } from "./textureUtils";
import { TABLE_DIMENSIONS } from "./layout";

const WALL_WIDTH = 5.2;
const WALL_HEIGHT = 2.6;
const GRID_COLS = 6;
const GRID_ROWS = 3;
const PHOTO_SIZE = 0.42;
const POSTER_WIDTH = 0.5;
const POSTER_HEIGHT = 0.625;
const ROW_SPACING = 0.5;

/**
 * The cubicle wall behind the desk: a felt-grey partition covered with a
 * grid of randomly-generated "photo" placeholders (polaroid-style frames)
 * plus a couple of framed demotivational posters for morale.
 * Swap `createPlaceholderPhotoTexture` for real loaded images from
 * `public/wall-images` when actual team photos are available.
 */
export function CubicleWall() {
  const wallZ = -(TABLE_DIMENSIONS.depth / 2 + 0.05);
  const wallY = TABLE_DIMENSIONS.height;
  // Keep the whole grid above the desk surface so the front row isn't
  // hidden behind the tabletop from the default camera angle.
  const gridBaseY = TABLE_DIMENSIONS.surfaceY + 0.12;

  // Reserve a couple of grid cells (deterministically chosen) for posters
  // instead of photos so they're mixed in among the wall clutter. Row 0
  // (cellIndex 0-5) sits low enough that the desk's near edge clips its
  // bottom in the default camera view, so pick cells from rows 1-2 instead,
  // where photos are already fully visible above the table.
  const posterCells = useMemo(() => new Set([8, 15]), []);

  const cells = useMemo(() => {
    const items: {
      x: number;
      y: number;
      rotation: number;
      seed: number;
      kind: "photo" | "poster";
      posterIndex: number;
    }[] = [];
    let seed = 7;
    let cellIndex = 0;
    let posterOrdinal = 0;
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++, cellIndex++) {
        seed += 1;
        const jitterSeed = seed * 12.9898;
        const jitter = (Math.sin(jitterSeed) * 43758.5453) % 1;
        const isPoster = posterCells.has(cellIndex);
        items.push({
          x: (col - (GRID_COLS - 1) / 2) * (PHOTO_SIZE + 0.12) + jitter * 0.05,
          y: gridBaseY + row * ROW_SPACING,
          rotation: (jitter - 0.5) * 0.35,
          seed,
          kind: isPoster ? "poster" : "photo",
          posterIndex: isPoster ? posterOrdinal++ : -1,
        });
      }
    }
    return items;
  }, [gridBaseY, posterCells]);

  return (
    <group>
      {/* Cubicle partition panel */}
      <mesh position={[0, wallY, wallZ]} receiveShadow>
        <boxGeometry args={[WALL_WIDTH, WALL_HEIGHT, 0.08]} />
        <meshStandardMaterial color="#9b9488" roughness={1} />
      </mesh>

      {cells.map((cell) =>
        cell.kind === "poster" ? (
          <Poster
            key={cell.seed}
            text={DEMOTIVATIONAL_SAYINGS[cell.posterIndex % DEMOTIVATIONAL_SAYINGS.length]}
            position={[cell.x, cell.y, wallZ + 0.05]}
            rotation={cell.rotation * 0.3}
          />
        ) : (
          <PolaroidPhoto
            key={cell.seed}
            seed={cell.seed}
            position={[cell.x, cell.y, wallZ + 0.05]}
            rotation={cell.rotation}
          />
        ),
      )}
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
