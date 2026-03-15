#!/usr/bin/env node
/**
 * optimize-assets.mjs — Phase 11 asset optimisation pipeline.
 *
 * PURPOSE
 * -------
 * Prepares 3D assets (glTF/GLB, images) for efficient browser delivery.
 * Run once after adding raw assets to apps/web/public/assets/raw/.
 * Outputs go to apps/web/public/assets/ (ready for Three.js GLTFLoader).
 *
 * PIPELINE
 * --------
 *   1. glTF Transform — mesh simplification, draco compression, dedup
 *   2. KTX2 / Basis Universal — compress textures to GPU-native format
 *   3. Metadata manifest — writes assets/manifest.json for runtime discovery
 *
 * DEPENDENCIES (install separately if needed)
 * -------------------------------------------
 *   npm install -g @gltf-transform/cli
 *   npm install -g ktx-software   (or use the basisu CLI from khronos)
 *
 * USAGE
 * -----
 *   npm run optimize-assets                # process all new/changed assets
 *   npm run optimize-assets -- --force     # reprocess everything
 *   npm run optimize-assets -- --dry-run   # preview actions, no writes
 *
 * CURRENT STATUS
 * --------------
 * V1: The underwater world uses fully procedural geometry (no glTF assets).
 * This script is a stub that validates the pipeline and exits cleanly.
 * It will be populated when external assets (coral models, fish, etc.) are
 * introduced in V2.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, "..");
const RAW_DIR    = join(REPO_ROOT, "apps", "web", "public", "assets", "raw");
const OUT_DIR    = join(REPO_ROOT, "apps", "web", "public", "assets");
const MANIFEST   = join(OUT_DIR, "manifest.json");

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE   = args.includes("--force");

// ── Ensure output directory exists ────────────────────────────────────────────
if (!DRY_RUN) {
  mkdirSync(OUT_DIR, { recursive: true });
}

// ── Discover raw assets ────────────────────────────────────────────────────────
const rawExists = existsSync(RAW_DIR);
const rawFiles  = rawExists ? readdirSync(RAW_DIR) : [];
const glbFiles  = rawFiles.filter((f) => f.endsWith(".glb") || f.endsWith(".gltf"));
const imgFiles  = rawFiles.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  abyssal-embodied-benchmark — asset optimisation         ║");
console.log("╚══════════════════════════════════════════════════════════╝");
console.log();
console.log(`  RAW dir : ${RAW_DIR}`);
console.log(`  OUT dir : ${OUT_DIR}`);
console.log(`  Mode    : ${DRY_RUN ? "DRY RUN" : FORCE ? "FORCE" : "incremental"}`);
console.log();

if (!rawExists || rawFiles.length === 0) {
  console.log("  ✓  No raw assets found — nothing to process.");
  console.log("     Place assets in apps/web/public/assets/raw/ and re-run.");
  console.log();
} else {
  console.log(`  Found ${glbFiles.length} model(s) and ${imgFiles.length} image(s):`);
  rawFiles.forEach((f) => console.log(`    • ${f}`));
  console.log();
  console.log("  ── Step 1: glTF Transform (mesh simplify + draco) ────────");
  if (glbFiles.length === 0) {
    console.log("    (no .glb/.gltf files — skipping)");
  } else {
    for (const f of glbFiles) {
      const src = join(RAW_DIR, f);
      const dst = join(OUT_DIR, f.replace(/\.(glb|gltf)$/, ".opt.glb"));
      if (DRY_RUN) {
        console.log(`    [dry] gltf-transform optimize ${src} ${dst} --compress draco`);
      } else {
        console.log(`    → ${f}  (manual step — run gltf-transform CLI or install deps)`);
        console.log(`      gltf-transform optimize "${src}" "${dst}" --compress draco`);
      }
    }
  }
  console.log();
  console.log("  ── Step 2: KTX2 texture compression ─────────────────────");
  if (imgFiles.length === 0) {
    console.log("    (no image files — skipping)");
  } else {
    for (const f of imgFiles) {
      const src = join(RAW_DIR, f);
      const dst = join(OUT_DIR, f.replace(/\.(png|jpg|jpeg|webp)$/i, ".ktx2"));
      if (DRY_RUN) {
        console.log(`    [dry] toktx --t2 --bcmp ${dst} ${src}`);
      } else {
        console.log(`    → ${f}  (manual step — install KTX-Software from khronos.org)`);
        console.log(`      toktx --t2 --bcmp "${dst}" "${src}"`);
      }
    }
  }
  console.log();
}

// ── Write manifest ─────────────────────────────────────────────────────────────
const manifest = {
  version: "1",
  generated: new Date().toISOString(),
  models: glbFiles.map((f) => ({
    raw: `assets/raw/${f}`,
    optimised: `assets/${f.replace(/\.(glb|gltf)$/, ".opt.glb")}`,
  })),
  textures: imgFiles.map((f) => ({
    raw: `assets/raw/${f}`,
    optimised: `assets/${f.replace(/\.(png|jpg|jpeg|webp)$/i, ".ktx2")}`,
  })),
};

if (!DRY_RUN) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`  ✓  Manifest written: ${MANIFEST}`);
} else {
  console.log(`  [dry] Would write manifest: ${MANIFEST}`);
}

console.log();
console.log("  Done.");
