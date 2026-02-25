"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";

interface ShaderWaveProps {
  theme?: "light" | "dark";
}

export const ShaderWave: React.FC<ShaderWaveProps> = ({ theme = "dark" }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current?.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        // u_theme: { value: theme === "dark" ? 1.0 : 0.0 }, // 1.0 for dark, 0.0 for light
      },
      fragmentShader: `
        precision mediump float;

        uniform float u_time;
        uniform vec2 u_resolution;

        float noise(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float smoothNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = noise(i);
            float b = noise(i + vec2(1.0, 0.0));
            float c = noise(i + vec2(0.0, 1.0));
            float d = noise(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
            float total = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 6; i++) { // More octaves for smoother movement
                total += smoothNoise(p) * amplitude;
                p *= 2.0;
                amplitude *= 0.5;
            }
            return total;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            uv.x *= u_resolution.x / u_resolution.y;

            float distortion = fbm(uv * 3.0 + vec2(u_time * 0.15, u_time * 0.1)) * 0.6;
            float wave = sin(uv.x * 7.0 + distortion + u_time * 0.6) * 0.5 + 
                         sin(uv.y * 7.0 + distortion + u_time * 0.7) * 0.5;

            vec3 waveColor = vec3(252.0 / 255.0, 195.0 / 255.0, 110.0 / 255.0);
            vec3 bgColor = vec3(239.0 / 255.0, 239.0 / 255.0, 239.0 / 255.0);

            vec3 color = mix(bgColor, waveColor, wave);
            gl_FragColor = vec4(color, 1.0);
        }
      `,
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Animation Loop (Faster & More Fluid)
    let lastTime = performance.now();
    const animate = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) * 0.0005;
      lastTime = currentTime;

      material.uniforms.u_time.value += deltaTime * 2.0; // Increase speed
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // Handle Resize
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      material.uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      mountRef.current?.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [theme]);

  return <div className="w-full h-full" ref={mountRef} />;
};
