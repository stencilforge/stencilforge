"use client";
import * as React from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Grid, OrbitControls, Lightformer, Edges } from "@react-three/drei";
import { Box, Maximize, Rotate3D } from "lucide-react";
import { useStudio } from "@/lib/store";
import { IconButton, Tip, Pill } from "@/components/ui/controls";

function StencilMesh({ flipped }: { flipped: boolean }) {
  const mesh = useStudio((s) => s.mesh);
  const result = useStudio((s) => s.result);

  const geometry = React.useMemo(() => {
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }, [mesh]);

  React.useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry || !result) return null;
  const w = result.bounds[2] - result.bounds[0];
  const h = result.bounds[3] - result.bounds[1];
  const t = geometry.boundingBox?.max.z ?? 2;
  // our model: x right, y up (plane), z thickness. Three: y up, so lay it flat (z -> y).
  // Flipped = print orientation, spray face on the bed.
  return (
    <group
      position={flipped ? [-w / 2, t, -h / 2] : [-w / 2, 0, h / 2]}
      rotation={flipped ? [Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, 0]}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#9aa3af" metalness={0.35} roughness={0.42} flatShading side={THREE.DoubleSide} />
        <Edges threshold={42} color="#e6e8eb" lineWidth={0.6} />
      </mesh>
    </group>
  );
}

function CameraRig({ trigger }: { trigger: number }) {
  const { camera, controls, size } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: (THREE.EventDispatcher & { target: THREE.Vector3; update: () => void }) | null;
    size: { width: number; height: number };
  };
  const result = useStudio((s) => s.result);
  const touched = React.useRef(false);
  const lastTrigger = React.useRef(trigger);

  // once the user orbits, stop auto-fitting on resize
  React.useEffect(() => {
    if (!controls) return;
    const onStart = () => (touched.current = true);
    controls.addEventListener("start" as never, onStart);
    return () => controls.removeEventListener("start" as never, onStart);
  }, [controls]);

  React.useEffect(() => {
    if (!result) return;
    if (lastTrigger.current !== trigger) {
      lastTrigger.current = trigger;
      touched.current = false;
    }
    if (touched.current) return;
    const w = result.bounds[2] - result.bounds[0];
    const h = result.bounds[3] - result.bounds[1];
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.2);
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    // the slab is seen at an angle, so give the depth a bit less weight than its width
    const need = Math.max(w / 2 / Math.tan(hHalf), (h * 0.62) / Math.tan(vHalf) / 1.0) * 1.35 + Math.max(w, h) * 0.12;
    const dir = new THREE.Vector3(0.16, 0.78, 0.6).normalize();
    camera.position.copy(dir.multiplyScalar(need));
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [trigger, result, size.width, size.height, camera, controls]);
  return null;
}

export function Viewport3D() {
  const mesh = useStudio((s) => s.mesh);
  const [flipped, setFlipped] = React.useState(false);
  const [fitTick, setFitTick] = React.useState(0);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows camera={{ fov: 38, near: 0.1, far: 5000, position: [40, 120, 110] }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[80, 160, 60]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
          <orthographicCamera attach="shadow-camera" args={[-160, 160, 160, -160, 1, 500]} />
        </directionalLight>
        <directionalLight position={[-120, 60, -80]} intensity={0.9} color="#7ab6ff" />
        <directionalLight position={[60, 20, -120]} intensity={0.6} color="#ff8a4a" />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.5} position={[0, 6, -9]} scale={[14, 4, 1]} color="#cfe3ff" />
          <Lightformer form="rect" intensity={1.6} position={[-6, 3, 4]} scale={[6, 6, 1]} color="#ff9f66" />
          <Lightformer form="ring" intensity={1.2} position={[6, 5, 4]} scale={4} color="#ffffff" />
        </Environment>
        <StencilMesh flipped={flipped} />
        <Grid
          position={[0, -0.01, 0]}
          infiniteGrid
          fadeDistance={650}
          fadeStrength={3}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#262a31"
          sectionSize={100}
          sectionThickness={0.8}
          sectionColor="#9a4a1f"
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.499} minDistance={10} maxDistance={900} />
        <CameraRig trigger={fitTick} />
      </Canvas>

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <Pill tone="volt">
          <Box className="mr-1 size-3" /> 3D preview
        </Pill>
        {mesh &&
          (mesh.openEdges === 0 && mesh.badEdges === 0 ? (
            <Pill tone="ok">watertight · {(mesh.indices.length / 3).toLocaleString()} tris</Pill>
          ) : (
            <Pill tone="danger">mesh has {mesh.openEdges + mesh.badEdges} bad edges</Pill>
          ))}
      </div>

      <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-2xl">
        <Tip label="Reset camera" side="top">
          <IconButton onClick={() => setFitTick((t) => t + 1)}>
            <Maximize className="size-4" />
          </IconButton>
        </Tip>
        <Tip label={flipped ? "Showing print orientation (spray face down)" : "Show print orientation"} side="top">
          <IconButton active={flipped} tone="ember" onClick={() => setFlipped((f) => !f)}>
            <Rotate3D className="size-4" />
          </IconButton>
        </Tip>
      </div>
    </div>
  );
}
