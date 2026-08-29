export interface AIBriefConfig {
  title: string;
  category: string; // 'PHYSICAL' | 'DIGITAL' | 'FEATURE_UNLOCK' | string
  description?: string;
  materials?: string;
  colorTheme?: string;
}

export interface CourageLibraryImageSpec {
  aspectRatio: string;
  canonicalResolution: string;
  heroCanvasOccupancy: string;
  marginStandard: string;
  primaryPalette: string[];
  backgroundFamily: string;
  brandIdentity: string;
}

export const COURAGE_LIBRARY_CANONICAL_SPEC: CourageLibraryImageSpec = {
  aspectRatio: "4:3",
  canonicalResolution: "1600 × 1200 pixels",
  heroCanvasOccupancy: "65%–75% subject coverage",
  marginStandard: "10%–12% safe breathing margins, complete subject naturally inside 4:3 canvas, zero cropping",
  primaryPalette: [
    "Deep Navy (#0A192F / #0F172A)",
    "Sapphire Blue (#1E3A8A / #2563EB)",
    "Restrained Warm Gold (#D4AF37 / #C59B27)",
    "Clean White (#FFFFFF)",
    "Neutral Slate / Charcoal (#334155 / #1E293B)",
  ],
  backgroundFamily: "Neutral warm-slate / dark-neutral matte studio backdrop with subtle tonal vignette",
  brandIdentity: "Premium, realistic, academic excellence, discipline, consistency, aspirational, and minimalist",
};

export interface GeneratedImageBrief {
  prompt: string; // Single combined copy-paste-ready prompt
  positivePrompt: string; // Alias for backward compatibility
  negativePrompt: string; // Empty string as constraints are embedded
  spec: CourageLibraryImageSpec;
}

/**
 * Builds a single, comprehensive, copy-paste-ready image generation prompt
 * strictly adhering to the Courage Library visual identity and 1:1 canonical specifications.
 */
export function buildRewardImagePrompt(config: AIBriefConfig): string {
  const { title, category, description, materials, colorTheme } = config;
  const lowerTitle = (title || "").toLowerCase();
  const isDigital =
    category === "DIGITAL" ||
    category === "FEATURE_UNLOCK" ||
    lowerTitle.includes("pass") ||
    lowerTitle.includes("retest") ||
    lowerTitle.includes("drill") ||
    lowerTitle.includes("voucher") ||
    lowerTitle.includes("unlock") ||
    lowerTitle.includes("subscription");

  const colors =
    colorTheme ||
    "Deep navy blue, subtle warm-gold accentuation, clean white highlights, and neutral slate undertones";

  let productConcept = "";
  let materialDetails = materials || "";
  let lightingDetails = "";
  let cameraDetails = "";
  let backgroundDetails = "";
  let qualityDetails = "";

  if (isDigital) {
    // DIGITAL REWARDS / FEATURE UNLOCKS / DIGITAL ASSETS
    if (lowerTitle.includes("shield") || lowerTitle.includes("freeze") || lowerTitle.includes("streak")) {
      productConcept = `Official Courage Library Study Streak Shield Digital Collectible Asset. A refined geometric emblem with multi-layered dimensional facets, subtle sapphire blue and amber luminescence along inner bevels, representing academic dedication and uninterrupted exam preparation momentum.`;
      materialDetails =
        materialDetails ||
        "Polished digital glassmorphic layers, precision micro-bevels, crisp luminescent vectors, and ultra-clean specular refraction.";
    } else if (lowerTitle.includes("retest") || lowerTitle.includes("drill") || lowerTitle.includes("pass") || lowerTitle.includes("error")) {
      productConcept = `Official Courage Library Examination Drill & Diagnostic Feature Asset. A sleek, high-precision digital card interface featuring crisp analytical performance graphs, structured question badge accents, and a prestigious Courage Library verified certification emblem.`;
      materialDetails =
        materialDetails ||
        "Frosted digital glassmorphism, OLED-calibrated clean typography, crisp vector borders, and refined translucent panels.";
    } else {
      productConcept = `Official Courage Library Digital Collectible: ${title}. ${
        description || "A prestigious digital achievement asset awarded for academic excellence and consistent preparation."
      }`;
      materialDetails =
        materialDetails ||
        "Polished digital surfaces, crisp geometric framing, refined micro-textures, and premium vector rendering.";
    }

    lightingDetails =
      "Refined ambient studio illumination with gentle edge-lighting and subtle interior luminescence. Controlled soft glow that accents contours without washing out typography or branding.";
    cameraDetails =
      "Frontal orthogonal/slight isometric perspective, perfectly balanced zero-distortion digital rendering, pin-sharp vector clarity across the entire canvas.";
    backgroundDetails =
      "Minimalist dark-slate studio backdrop with a subtle radial gradient falloff in deep navy tones, perfectly uncluttered to highlight the central digital asset.";
    qualityDetails =
      "Ultra-high-definition digital artwork, 8k render fidelity, razor-sharp vector edges, perfectly smooth gradients, commercially polished app/store presentation asset.";
  } else {
    // PHYSICAL MERCHANDISE / TANGIBLE REWARDS
    if (lowerTitle.includes("bottle") || lowerTitle.includes("flask") || lowerTitle.includes("sipper")) {
      productConcept = `Official Courage Library Insulated Thermal Bottle, 750ml capacity. Sleek cylindrical ergonomic silhouette with a seamless double-wall vacuum body, powder-coated matte finish in deep navy blue, precision-engraved brushed stainless steel cap with a tactile silicone grip ring.`;
      materialDetails =
        materialDetails ||
        "Food-grade 18/8 stainless steel, tactile scratch-resistant matte powder coating, brushed steel trim, and food-grade silicone seals.";
    } else if (lowerTitle.includes("diary") || lowerTitle.includes("notebook") || lowerTitle.includes("journal") || lowerTitle.includes("planner")) {
      productConcept = `Official Courage Library Hardbound Study & Revision Diary, A5 format. Structured book binding with rounded corners, premium textured vegan leather hardcover in midnight navy, amber-gold satin ribbon page marker, elastic closure band, and a subtle debossed gold-foil Courage Library emblem centered on the front cover.`;
      materialDetails =
        materialDetails ||
        "Textured vegan leatherette hardcover, 100 GSM acid-free ivory revision paper, gold hot-stamping foil, and reinforced Smyth-sewn binding.";
    } else if (lowerTitle.includes("t-shirt") || lowerTitle.includes("tshirt") || lowerTitle.includes("shirt") || lowerTitle.includes("apparel") || lowerTitle.includes("hoodie")) {
      productConcept = `Official Courage Library Examination Merchandise T-Shirt. Premium unisex crewneck garment neatly presented on a minimalist flat display, tailored structured fit in deep midnight navy, reinforced double-needle hem stitching, with a subtle, high-density embroidered Courage Library insignia on the left chest.`;
      materialDetails =
        materialDetails ||
        "240 GSM 100% organic combed cotton, structured fabric drape, tactile micro-weave texture, and satin-stitched inner neck tape.";
    } else if (lowerTitle.includes("shield") || lowerTitle.includes("trophy") || lowerTitle.includes("token") || lowerTitle.includes("award") || lowerTitle.includes("medal")) {
      productConcept = `Official Courage Library Study Streak Physical Shield Award. Precision-cut sapphire-tinted optical crystal emblem with diamond-beveled geometric facets and restrained warm-gold metal accents, anchored securely on a brushed dark-slate titanium base.`;
      materialDetails =
        materialDetails ||
        "Optical-grade K9 crystal glass, precision CNC-machined titanium base, laser-etched internal insignia, and restrained warm-gold electroplated trim.";
    } else if (lowerTitle.includes("kit") || lowerTitle.includes("pack") || lowerTitle.includes("stationery")) {
      productConcept = `Official Courage Library Student Preparation Kit. A cohesive set arranged in an immaculate commercial display: hardbound study journal, precision matte-navy metal pen, revision roadmap card, and branded bookmarks.`;
      materialDetails =
        materialDetails ||
        "Anodized aluminium, matte heavy cardstock, debossed vegan leather, and satin ribbon accents.";
    } else {
      productConcept = `Official Courage Library Reward Product: ${title}. ${
        description || "A commercially manufactured premium educational reward designed for serious competitive-exam students."
      }`;
      materialDetails =
        materialDetails ||
        "Commercial-grade durable materials, premium matte finish with tactile micro-textures and refined metallic trim.";
    }

    lightingDetails =
      "Professional commercial studio lighting. Soft key light from upper-left, gentle fill light to preserve shadow details, subtle rim/specular highlights defining product edges, and natural soft contact shadows directly beneath the product.";
    cameraDetails =
      "Commercial product photography captured with an 85mm prime lens at f/4 aperture. Natural human perspective with zero wide-angle distortion, razor-sharp focal plane across the entire product, and subtle background separation.";
    backgroundDetails =
      "Neutral warm-slate / dark-neutral matte studio backdrop with a smooth, subtle tonal transition. Completely clean, minimalist, and uncluttered with zero distracting props.";
    qualityDetails =
      "Commercial e-commerce catalog photography master, 8k resolution, ultra-photorealistic textures, physically accurate light absorption, authentic manufacturing seams and tolerances.";
  }

  const promptSections = [
    `Create a premium, ultra-photorealistic commercial ${
      isDigital ? "digital asset visualization" : "product photograph"
    } for the Courage Library rewards ecosystem.`,

    `PRODUCT:\n${title || "Courage Library Official Reward"} (${category || (isDigital ? "DIGITAL" : "PHYSICAL")})`,

    `CREATION MANDATE:\nCreate the complete product design from scratch. No physical reference product exists. Design a commercially plausible product with realistic proportions, materials, manufacturing details, and physically believable construction.`,

    `CONCEPT & SPECIFICATIONS:\n${productConcept}`,

    `MATERIALS & CONSTRUCTION:\n${materialDetails}`,

    `BRANDING & VISUAL IDENTITY:\n- Palette: ${colors}.\n- Aesthetic: Refined academic excellence, discipline, consistency, serious competitive-exam preparation, aspirational, and minimalist. Never childish, gaming-like, cheap merchandise, or fantasy-oriented. Branding must remain subtle, elegant, and balanced.`,

    `OFFICIAL LOGO REFERENCE INSTRUCTIONS:\n- If an official Courage Library logo image is supplied with this prompt, use that exact supplied logo as the branding reference. Preserve its original geometry, proportions, colors and identity. Do not redraw, reinterpret, redesign, stylize, simplify, distort or replace the logo.\n- If no logo reference image is supplied: Do not invent or approximate the Courage Library logo. Do not generate a fake logo. Leave the branding area clean and suitable for adding the official logo later.`,

    `IMAGE & CANVAS SPECIFICATION (CANONICAL COURAGE LIBRARY 4:3 MASTER STANDARD):\n- Aspect Ratio: 4:3 (Master composition, 1600 × 1200 pixels canonical target)\n- Framing: Subject naturally proportioned and balanced inside the 4:3 canvas, occupying approximately 65%–75% of the frame\n- Safe Margins: 10%–12% perimeter safe breathing room, complete subject inside frame, zero edge cropping, zero distortion or stretching of native proportions\n- Visual Scale: Standardized catalog scale across all Courage Library store items`,

    `LIGHTING & STUDIO SETUP:\n${lightingDetails}`,

    `CAMERA & OPTICS:\n${cameraDetails}`,

    `BACKGROUND:\n${backgroundDetails}. Do NOT add random props (no books, laptops, pens, desks, classrooms, people, or exam papers unless integral to the item). The reward must remain the hero.`,

    `QUALITY & FIDELITY:\n${qualityDetails}`,

    `IMPORTANT RESTRICTIONS:\nDo not create cartoon styling, 3D CGI toy appearance, low-poly geometry, distorted branding, fake text, misspelled words, duplicate objects, random props, watermarks, stock-photo signatures, cropping, inconsistent proportions, excessive neon, excessive glow, oversaturation, harsh direct flash, busy backgrounds, unrealistic materials, or physically impossible construction.`,
  ];

  return promptSections.join("\n\n");
}

/**
 * Legacy & modern wrapper returning the single prompt with metadata
 */
export function generateRewardImageBrief(config: AIBriefConfig): GeneratedImageBrief {
  const unifiedPrompt = buildRewardImagePrompt(config);

  return {
    prompt: unifiedPrompt,
    positivePrompt: unifiedPrompt, // Backward compatibility
    negativePrompt: "", // Constraints are now embedded in unified prompt
    spec: COURAGE_LIBRARY_CANONICAL_SPEC,
  };
}

