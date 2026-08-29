export interface AIBriefConfig {
  title: string;
  category: string;
  description: string;
  materials?: string;
  colorTheme?: string;
}

export interface GeneratedImageBrief {
  positivePrompt: string;
  negativePrompt: string;
  modelSettings: {
    aspectRatio: string;
    lighting: string;
    camera: string;
    style: string;
  };
}

/**
 * Generates an authoritative AI Image Brief for Courage Library merchandise and digital rewards
 */
export function generateRewardImageBrief(config: AIBriefConfig): GeneratedImageBrief {
  const { title, category, description, materials, colorTheme } = config;

  let productDetails = "";
  let materialDetails = materials || "Premium durable matte composite with metallic accents";
  const colors = colorTheme || "Deep navy blue, subtle gold emblem details, and clean white accents";

  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("bottle")) {
    productDetails = "A premium vacuum-insulated stainless steel water bottle, 750ml capacity, cylindrical ergonomic silhouette, double-wall thermal construction with a powder-coated matte finish in deep royal navy blue. Features an engraved brushed steel cap with a leak-proof silicone grip band.";
    materialDetails = "Food-grade 18/8 stainless steel, tactile matte powder coating, subtle brushed steel trim.";
  } else if (lowerTitle.includes("diary") || lowerTitle.includes("notebook")) {
    productDetails = "A luxury hardbound study planner and revision diary, A5 format, textured vegan leather cover in deep midnight navy with rounded corners, ribbon bookmark in amber gold, elastic closure band, and gold-foil debossed Courage Library crest on the cover.";
    materialDetails = "100 GSM acid-free ivory pages, premium debossed leatherette hardcover with gold hot-stamping.";
  } else if (lowerTitle.includes("t-shirt") || lowerTitle.includes("apparel")) {
    productDetails = "A premium unisex crew-neck examination merchandise t-shirt, neatly folded on a minimalist solid wood display riser, crafted from heavyweight combed cotton in rich navy blue with a subtle embroidered Courage Library emblem on the left chest.";
    materialDetails = "240 GSM 100% organic combed cotton, structured drape, reinforced collar with satin inner tape.";
  } else if (lowerTitle.includes("prep kit")) {
    productDetails = "A cohesive Courage Library student preparation kit arranged in a neat knolling layout: hardbound study journal, precision metal ballpoint pen with matte finish, revision sticky note set, and a laminated exam syllabus roadmap card.";
    materialDetails = "Brushed anodized metal, matte cardstock, premium debossed notebook cover.";
  } else if (lowerTitle.includes("freeze") || lowerTitle.includes("shield") || lowerTitle.includes("token")) {
    productDetails = "A glowing crystalline physical artifact representing a Study Streak Shield token, precision-cut sapphire blue crystal glass emblem with geometric facets and an internal radiant amber core, resting on a brushed dark slate pedestal.";
    materialDetails = "Optical crystal glass, internal luminescence, brushed titanium pedestal.";
  } else if (lowerTitle.includes("retest") || lowerTitle.includes("drill") || lowerTitle.includes("error")) {
    productDetails = "A conceptual digital study asset badge: a sleek modern glassmorphism tablet displaying interactive analytical question cards with crisp typography, diagnostic graphs, and weakness repair drills.";
    materialDetails = "Frosted glassmorphism, OLED vibrant display elements, minimal aluminium chassis.";
  } else {
    productDetails = `A premium official educational reward item: ${title}. ${description}`;
  }

  const positivePrompt = [
    `Commercial product photography of [${category.replace("_", " ")}] ${productDetails}`,
    `Branding & Aesthetics: Official Courage Library branding in ${colors}. Crisp typography, clean embossed/debossed logo mark, authentic academic achievement aesthetic.`,
    `Materials & Texture: ${materialDetails}. Realistic micro-surface textures, tactile finishes, accurate light absorption and diffusion on materials.`,
    `Lighting & Studio Setup: Professional commercial studio lighting, soft key light from upper-left with gentle fill light, subtle specular highlights defining product contours, natural soft contact shadows beneath product.`,
    `Composition: Centered hero product presentation, clean minimalist studio backdrop with neutral warm-slate matte finish, ample negative space for e-commerce catalog presentation. Shot with 85mm prime lens at f/4 aperture, sharp focal clarity across entire item, subtle depth-of-field separation from background.`,
    `Quality standard: 8k resolution, ultra-photorealistic, commercially viable product catalog photograph, authentic manufacturing details, perfect symmetrical proportions, physically plausible materials.`,
  ].join("\n\n");

  const negativePrompt = [
    "cartoon, 3D CGI animation style, plastic toy look, low poly, oversaturated neon, distorted geometry, warped text, misspelled words, duplicate products, floating random objects, messy background, harsh direct flash, amateur mobile photo, watermarks, stock photo signatures, low resolution, blurry edges, heavy vignettes, cheap clip-art artifacts.",
  ].join(" ");

  return {
    positivePrompt,
    negativePrompt,
    modelSettings: {
      aspectRatio: "1:1 (Square) or 4:3 (Product Hero)",
      lighting: "Soft Commercial Studio Diffusion (Key + Rim)",
      camera: "85mm Prime Lens, f/4, ISO 100",
      style: "E-Commerce Luxury Product Photography",
    },
  };
}
