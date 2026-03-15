/**
 * Stub type declarations for postprocessing packages.
 *
 * These are used during TypeScript compilation when the packages are listed
 * in package.json but not yet installed (e.g. CI typecheck before npm install).
 * After `npm install` the real type declarations from the packages take
 * precedence over these stubs.
 *
 * Do NOT add detailed API shapes here — keep them minimal to avoid conflicts
 * with the real types once installed.
 */

declare module "postprocessing" {
  export enum BlendFunction {
    ADD    = "add",
    NORMAL = "normal",
  }
  export enum ToneMappingMode {
    ACES_FILMIC = "aces-filmic",
  }
}

declare module "@react-three/postprocessing" {
  import type { ReactNode } from "react";

  export interface EffectComposerProps {
    children?: ReactNode;
    multisampling?: number;
    /** Set false to skip NormalPass creation (saves a render pass). Default: true in v2. */
    enableNormalPass?: boolean;
  }
  export function EffectComposer(props: EffectComposerProps): JSX.Element | null;

  export interface BloomProps {
    luminanceThreshold?: number;
    luminanceSmoothing?: number;
    intensity?: number;
    blendFunction?: unknown;
  }
  export function Bloom(props: BloomProps): JSX.Element | null;

  export interface VignetteProps {
    offset?: number;
    darkness?: number;
    blendFunction?: unknown;
  }
  export function Vignette(props: VignetteProps): JSX.Element | null;

  export function SMAA(): JSX.Element | null;

  export interface ToneMappingProps {
    mode?: unknown;
    blendFunction?: unknown;
  }
  export function ToneMapping(props: ToneMappingProps): JSX.Element | null;
}
