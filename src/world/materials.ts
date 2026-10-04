import * as THREE from 'three'

export const palette = {
  purple: 0xc252e1,
  cyan: 0x6ecbf5,
  dark: 0x1a1a1a,
  night: 0x120a1c,
  stone: 0x3a3442,
  bone: 0xe8e2f0,
}

/* A tiling grid, so that movement and distance are readable on flat surfaces. */
export function gridTexture(background: string, line: string, repeat: number): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = line
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 8
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function matte(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
}

export function glow(color: number, intensity = 1.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  })
}

/*
  A gradient sky drawn around whichever camera is rendering. It ignores the
  camera's position, so it looks the same from every side of every portal.
*/
export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x05030a) },
      horizon: { value: new THREE.Color(0x3a1a52) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        // z = w pins the sky to the far plane. It must still be depth tested,
        // or it would paint over the portal views sealed in front of it.
        gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDirection;
      void main() {
        float h = normalize(vDirection).y;
        vec3 color = mix(horizon, top, smoothstep(-0.05, 0.6, h));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), material)
  sky.renderOrder = -1000
  sky.frustumCulled = false
  return sky
}
