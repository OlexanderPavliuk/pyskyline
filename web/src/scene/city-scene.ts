import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  type LineBasicMaterial,
  type LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Building, CityLayout } from "../layout/city";
import { buildBridges } from "./bridges";

/** Thickness of one district level; nested folders stack like terraces. */
export const SLAB = 1.2;
const BACKGROUND = new Color("#0e0e10");
const DISTRICT_LOW = new Color("#18181c");
const DISTRICT_HIGH = new Color("#2c2c33");
export const IMPORT_COLOR = new Color("#f4f4f6");
export const IMPORTED_BY_COLOR = new Color("#ff8a6b");
const FLIGHT_MS = 700;

export class CityScene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private readonly sun = new DirectionalLight("#ffffff", 2.2);
  private readonly box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private cityMeshes: InstancedMesh[] = [];
  private readonly disposables: Mesh[] = [];
  private readonly bridges: LineSegments[] = [];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private flight: {
    start: number;
    fromPosition: Vector3;
    fromTarget: Vector3;
    toPosition: Vector3;
    toTarget: Vector3;
  } | null = null;
  buildingMesh: InstancedMesh | null = null;
  layout: CityLayout | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.append(this.renderer.domElement);

    this.camera = new PerspectiveCamera(45, 1, 0.1, 10_000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    // Never let the camera dip below the ground.
    this.controls.maxPolarAngle = Math.PI * 0.47;

    this.scene.background = BACKGROUND;
    this.scene.add(new HemisphereLight("#ffffff", "#202024", 1.1));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time) => {
      this.advanceFlight(time);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Index of the building under a screen point, or null. */
  pick(clientX: number, clientY: number): number | null {
    if (!this.buildingMesh) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const [hit] = this.raycaster.intersectObject(this.buildingMesh, false);
    return hit?.instanceId ?? null;
  }

  /** Center of a building's roof in world space. */
  rooftop(index: number): Vector3 {
    const { base, size } = this.buildingBox(index);
    return base.setY(base.y + size.y);
  }

  /** Bottom center and dimensions of a building. */
  private buildingBox(index: number): { base: Vector3; size: Vector3 } {
    const matrix = new Matrix4();
    this.buildingMesh?.getMatrixAt(index, matrix);
    const base = new Vector3();
    const size = new Vector3();
    matrix.decompose(base, new Quaternion(), size);
    return { base, size };
  }

  showBridges(from: number, imports: readonly number[], importedBy: readonly number[]): void {
    this.clearBridges();
    const start = this.rooftop(from);
    for (const [targets, color] of [
      [imports, IMPORT_COLOR],
      [importedBy, IMPORTED_BY_COLOR],
    ] as const) {
      if (targets.length === 0) continue;
      const lines = buildBridges(start, targets.map((i) => this.rooftop(i)), color);
      this.scene.add(lines);
      this.bridges.push(lines);
    }
  }

  clearBridges(): void {
    for (const lines of this.bridges.splice(0)) {
      this.scene.remove(lines);
      lines.geometry.dispose();
      (lines.material as LineBasicMaterial).dispose();
    }
  }

  /** Smoothly moves the camera to look at a building from the current direction. */
  flyTo(index: number): void {
    const { base, size } = this.buildingBox(index);
    const target = base.clone().setY(base.y + size.y * 0.5);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    // Far enough to see the whole building plus some of its neighborhood.
    const extent = Math.max(size.x, size.y, size.z);
    const distance = extent * 2.4 + (this.layout?.size ?? 100) * 0.08;
    this.flight = {
      start: performance.now(),
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: target.clone().addScaledVector(direction, distance),
      toTarget: target,
    };
  }

  private advanceFlight(time: number): void {
    const flight = this.flight;
    if (!flight) return;
    const t = Math.min((time - flight.start) / FLIGHT_MS, 1);
    const eased = 1 - (1 - t) ** 3;
    this.camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
    this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    if (t === 1) this.flight = null;
  }

  setCity(layout: CityLayout, heights: readonly number[], colors: readonly Color[]): void {
    this.clear();
    this.layout = layout;
    const { size } = layout;

    const ground = new Mesh(
      new PlaneGeometry(size * 6, size * 6).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: "#121215", roughness: 1 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.disposables.push(ground);

    const maxDepth = Math.max(...layout.districts.map((d) => d.depth), 1);
    const districts = this.instanced(layout.districts.length, false);
    layout.districts.forEach((district, i) => {
      districts.setMatrixAt(i, boxMatrix(district.rect, district.depth * SLAB, SLAB));
      districts.setColorAt(i, DISTRICT_LOW.clone().lerp(DISTRICT_HIGH, district.depth / maxDepth));
    });

    const buildings = this.instanced(layout.buildings.length, true);
    layout.buildings.forEach((building, i) => {
      buildings.setMatrixAt(i, boxMatrix(building.rect, baseHeight(building), heights[i] ?? 1));
      buildings.setColorAt(i, colors[i] ?? new Color("#888888"));
    });
    this.buildingMesh = buildings;

    this.scene.fog = new Fog(BACKGROUND, size * 1.2, size * 4);
    this.sun.position.set(size * 0.5, size * 0.9, size * 0.3);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -size * 0.8;
    shadow.right = shadow.top = size * 0.8;
    shadow.far = size * 3;
    shadow.updateProjectionMatrix();

    this.camera.near = size * 0.005;
    this.camera.far = size * 10;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = size * 0.05;
    this.controls.maxDistance = size * 3;
    this.resetView();
  }

  setColors(colors: readonly Color[]): void {
    const mesh = this.buildingMesh;
    if (!mesh) return;
    colors.forEach((color, i) => mesh.setColorAt(i, color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  resetView(): void {
    const size = this.layout?.size ?? 100;
    this.camera.position.set(size * 0.85, size * 0.85, size * 1.05);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private instanced(count: number, castShadow: boolean): InstancedMesh {
    const material = new MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 });
    const mesh = new InstancedMesh(this.box, material, Math.max(count, 1));
    mesh.count = count;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.cityMeshes.push(mesh);
    return mesh;
  }

  private clear(): void {
    this.clearBridges();
    this.flight = null;
    for (const mesh of this.cityMeshes) {
      this.scene.remove(mesh);
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
    for (const mesh of this.disposables.splice(0)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.cityMeshes = [];
    this.buildingMesh = null;
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

export function baseHeight(building: Building): number {
  return (building.depth + 1) * SLAB;
}

const NO_ROTATION = new Quaternion();

function boxMatrix(
  rect: { x: number; y: number; w: number; h: number },
  base: number,
  height: number,
): Matrix4 {
  // Treemap x/y become world x/z; the box geometry already has its origin at the bottom.
  return new Matrix4().compose(
    new Vector3(rect.x + rect.w / 2, base, rect.y + rect.h / 2),
    NO_ROTATION,
    new Vector3(rect.w, height, rect.h),
  );
}
