import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Building, CityLayout } from "../layout/city";

/** Thickness of one district level; nested folders stack like terraces. */
export const SLAB = 1.2;
const BACKGROUND = new Color("#0e0e10");
const DISTRICT_LOW = new Color("#18181c");
const DISTRICT_HIGH = new Color("#2c2c33");

export class CityScene {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly scene = new Scene();
  private readonly sun = new DirectionalLight("#ffffff", 2.2);
  private readonly box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private cityMeshes: InstancedMesh[] = [];
  private readonly disposables: Mesh[] = [];
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
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
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
