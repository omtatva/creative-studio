import * as THREE from "three";

/**
 * A real raymarched signed-distance-field (SDF) "metaball" material —
 * not a particle system. Blob centers (uniform vec3 array) are
 * smooth-min blended into one continuous implicit surface each frame
 * and sphere-traced per pixel, giving a genuine liquid-glass look
 * (fresnel rim, internal glow, soft falloff) rather than an
 * approximation. Rendered on a quad that's repositioned every frame
 * to exactly fill the camera's view frustum at a fixed distance (see
 * MetaballField.tsx), so each vertex's world position IS the correct
 * per-pixel ray target after interpolation — no inverse-projection
 * math needed.
 */

function buildFragmentShader(numBlobs: number, maxSteps: number): string {
  return /* glsl */ `
    precision highp float;
    #define NUM_BLOBS ${numBlobs}
    #define MAX_STEPS ${maxSteps}
    #define MAX_DIST 26.0
    #define SURF_DIST 0.012

    uniform vec3 uCameraPos;
    uniform vec3 uBlobCenters[NUM_BLOBS];
    uniform float uBlobRadius;
    uniform float uSmoothK;
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    uniform float uEmissive;
    uniform float uOpacity;

    varying vec3 vWorldPos;

    float mapScene(vec3 p) {
      float d = 1000.0;
      for (int i = 0; i < NUM_BLOBS; i++) {
        float bd = length(p - uBlobCenters[i]) - uBlobRadius;
        float h = clamp(0.5 + 0.5 * (d - bd) / uSmoothK, 0.0, 1.0);
        d = mix(d, bd, h) - uSmoothK * h * (1.0 - h);
      }
      return d;
    }

    vec3 calcNormal(vec3 p) {
      vec2 e = vec2(0.0025, 0.0);
      return normalize(vec3(
        mapScene(p + e.xyy) - mapScene(p - e.xyy),
        mapScene(p + e.yxy) - mapScene(p - e.yxy),
        mapScene(p + e.yyx) - mapScene(p - e.yyx)
      ));
    }

    void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vWorldPos - uCameraPos);

      float dO = 0.0;
      bool hit = false;
      for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = mapScene(p);
        if (dS < SURF_DIST) { hit = true; break; }
        dO += dS;
        if (dO > MAX_DIST) break;
      }

      if (!hit) {
        discard;
      }

      vec3 p = ro + rd * dO;
      vec3 n = calcNormal(p);
      vec3 lightDir = normalize(vec3(0.4, 0.7, 0.6));
      float diff = max(dot(n, lightDir), 0.0);
      float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.2);
      float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);

      vec3 color = mix(uBaseColor, uRimColor, fresnel * 0.65);
      color = color * (0.3 + diff * 0.55) + uRimColor * fresnel * 0.6 + vec3(1.0) * spec * 0.5;
      color += uBaseColor * uEmissive;

      float fog = clamp((dO - 3.0) / 18.0, 0.0, 1.0);
      color = mix(color, vec3(0.02, 0.03, 0.06), fog);

      gl_FragColor = vec4(color, uOpacity);
    }
  `;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export interface MetaballMaterialHandle {
  material: THREE.ShaderMaterial;
  blobCenters: THREE.Vector3[];
}

/** Creates the shader material plus the mutable blob-center array the animation loop writes into each frame. */
export function createMetaballMaterial(numBlobs: number, maxSteps = 72): MetaballMaterialHandle {
  const blobCenters = Array.from({ length: numBlobs }, () => new THREE.Vector3(0, 0, -999));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: buildFragmentShader(numBlobs, maxSteps),
    uniforms: {
      uCameraPos: { value: new THREE.Vector3() },
      uBlobCenters: { value: blobCenters },
      uBlobRadius: { value: 0.2 },
      uSmoothK: { value: 0.12 },
      uBaseColor: { value: new THREE.Color("#4f56d6") },
      uRimColor: { value: new THREE.Color("#22d3ee") },
      uEmissive: { value: 0.1 },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
  });

  return { material, blobCenters };
}
