import * as THREE from 'three';
import type { Tier } from './renderer';

type Surface = Omit<THREE.MeshStandardMaterialParameters, 'roughness' | 'metalness'> & { roughness: number; metalness: number };

// Software rendering shades every pixel on the CPU, so the plain tier uses the far cheaper Lambert model.
export function surfaceMaterial(tier: Tier, { roughness, metalness, ...shared }: Surface): THREE.MeshLambertMaterial | THREE.MeshStandardMaterial {
  return tier === 'plain' ? new THREE.MeshLambertMaterial(shared) : new THREE.MeshStandardMaterial({ ...shared, roughness, metalness });
}
