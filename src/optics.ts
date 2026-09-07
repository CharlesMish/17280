import * as THREE from "three";

export const OPTICS_MODES = ["translucent", "opaque", "hidden"] as const;
export type OpticsMode = typeof OPTICS_MODES[number];

/** Stock WebGL transmission captures only opaque objects. Supply the sapphire
 * with the complete interior, including the translucent ruby front surfaces. */
export function createOptics(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  sapphireMaterials: THREE.MeshPhysicalMaterial[], initialMode: OpticsMode,
  alphaInterior: THREE.Mesh[] = []) {
  let mode = initialMode;
  const sapphire = new Set<THREE.Material>(sapphireMaterials);
  const size = new THREE.Vector2();
  const floatTarget = renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float");
  const interior = new THREE.WebGLRenderTarget(1, 1, {
    type: floatTarget ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true, samples: 4,
  });
  interior.texture.name = "watch:interior-with-jewels";
  interior.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const uniforms = {
    watchInterior: { value: interior.texture }, watchInteriorSize: { value: size },
    watchUseInterior: { value: false },
  };
  for (const material of sapphireMaterials) {
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, gl) {
      previousCompile.call(this, shader, gl);
      Object.assign(shader.uniforms, uniforms);
      const chunk = THREE.ShaderChunk.transmission_pars_fragment
        .replace("uniform float transmission;", `uniform float transmission;
          uniform sampler2D watchInterior;
          uniform vec2 watchInteriorSize;
          uniform bool watchUseInterior;`)
        .replace("log2( transmissionSamplerSize.x )", "log2( watchUseInterior ? watchInteriorSize.x : transmissionSamplerSize.x )")
        .replace("return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );",
          "if ( watchUseInterior ) return textureBicubic( watchInterior, fragCoord.xy, lod );\nreturn textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );");
      shader.fragmentShader = shader.fragmentShader.replace("#include <transmission_pars_fragment>", chunk);
    };
    material.customProgramCacheKey = () => `${previousKey}:watch-interior-v1`;
    material.needsUpdate = true;
  }
  const opaqueMaterials = new Map<THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial>();
  const render = (camera: THREE.Camera): void => {
    const hasAlphaInterior = alphaInterior.some(mesh => {
      for (let owner: THREE.Object3D | null = mesh; owner; owner = owner.parent) if (!owner.visible) return false;
      return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.transparent && m.opacity < 1);
    });
    const depthWrites = new Map<THREE.Material, boolean>();
    const crystals: { mesh: THREE.Mesh; visible: boolean; order: number }[] = [];
    const gemstones = new Map<THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial>();
    // Resolve current assignments: camera/audit modes can replace materials.
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      if (object.userData.phase5dOpticalOwner || materials.some(m => sapphire.has(m))) {
        crystals.push({ mesh: object, visible: object.visible, order: object.renderOrder });
      } else if (mode === "opaque") {
        for (const material of materials) {
          if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0 && !gemstones.has(material)) {
            let replacement = opaqueMaterials.get(material);
            if (!replacement) { replacement = material.clone(); opaqueMaterials.set(material, replacement); }
            replacement.copy(material);
            replacement.transmission = 0;
            replacement.transparent = false;
            replacement.opacity = 1;
            gemstones.set(material, replacement);
          }
        }
      }
    });
    const assignments: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
    if (gemstones.size) scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material as THREE.Material | THREE.Material[];
      const mapped = (m: THREE.Material) => gemstones.get(m as THREE.MeshPhysicalMaterial) ?? m;
      if ((Array.isArray(original) ? original : [original]).some(m => gemstones.has(m as THREE.MeshPhysicalMaterial))) {
        assignments.push({ mesh: object, material: original });
        object.material = Array.isArray(original) ? original.map(mapped) : mapped(original);
      }
    });
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const toneMapping = renderer.toneMapping;
    try {
      uniforms.watchUseInterior.value = false;
      if (mode === "hidden") {
        for (const { mesh } of crystals) mesh.visible = false;
      } else if ((mode === "translucent" || hasAlphaInterior) && crystals.some(({ mesh }) => {
        for (let owner: THREE.Object3D | null = mesh; owner; owner = owner.parent) if (!owner.visible) return false;
        return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => sapphire.has(m) && (m as THREE.MeshPhysicalMaterial).transmission > 0);
      })) {
        renderer.getDrawingBufferSize(size);
        interior.setSize(size.x, size.y);
        for (const { mesh } of crystals) mesh.visible = false;
        renderer.setRenderTarget(interior);
        // Keep radiance linear; only the final display applies tone mapping.
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.render(scene, camera);
        renderer.setRenderTarget(target, cubeFace, mip);
        renderer.toneMapping = toneMapping;
        for (const { mesh, visible } of crystals) {
          mesh.visible = visible;
          // With the interior available, draw sapphire after the jewels so its
          // reflection also covers them. Per-pixel depth testing stays enabled.
          mesh.renderOrder = 1000;
          // The complete interior already includes the alpha dial. Write the
          // crystal depth so the later transparent pass cannot overlay it again.
          // Uncovered portions in an exploded view still render normally.
          if (hasAlphaInterior) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (sapphire.has(material) && !depthWrites.has(material)) {
              depthWrites.set(material, material.depthWrite);
              material.depthWrite = true;
            }
          }
        }
        uniforms.watchUseInterior.value = true;
      }
      renderer.render(scene, camera);
    } finally {
      uniforms.watchUseInterior.value = false;
      renderer.setRenderTarget(target, cubeFace, mip);
      renderer.toneMapping = toneMapping;
      for (const { mesh, visible, order } of crystals) { mesh.visible = visible; mesh.renderOrder = order; }
      for (const { mesh, material } of assignments) mesh.material = material;
      for (const [material, depthWrite] of depthWrites) material.depthWrite = depthWrite;
    }
  };
  return {
    render, mode: () => mode,
    setMode: (next: OpticsMode) => {
      if (!OPTICS_MODES.includes(next)) throw new Error(`Unknown optics mode: ${next}`);
      mode = next;
    },
    dispose: () => { interior.dispose(); for (const material of opaqueMaterials.values()) material.dispose(); },
  };
}
