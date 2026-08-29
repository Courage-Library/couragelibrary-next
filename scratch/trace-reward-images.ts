import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envVars: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      envVars[key] = val;
    }
  }
}

const supabaseUrl = envVars["NEXT_PUBLIC_SUPABASE_URL"];
const serviceKey = envVars["SUPABASE_SERVICE_ROLE_KEY"];

async function main() {
  console.log("Supabase URL:", supabaseUrl);

  console.log("\n=== STEP 1 & 2: FORENSIC TRACE OF REWARD_CATALOG ===");
  const catRes = await fetch(`${supabaseUrl}/rest/v1/reward_catalog?select=*&order=display_order.asc`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  const catalogRows = await catRes.json();
  console.log(`Found ${catalogRows?.length || 0} reward_catalog rows:`);
  for (const row of catalogRows || []) {
    console.log(`\n- Reward: "${row.title}" (ID: ${row.id}, Slug: ${row.slug})`);
    console.log(`  reward_type: ${row.reward_type}`);
    console.log(`  image_url: ${JSON.stringify(row.image_url)}`);
    console.log(`  is_active: ${row.is_active}`);
  }

  console.log("\n=== STEP 3: STORAGE 'store-rewards' BUCKET INSPECTION ===");
  const bucketsRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const buckets = await bucketsRes.json();
  console.log("Buckets:", buckets);

  const objectsRes = await fetch(`${supabaseUrl}/storage/v1/object/list/store-rewards`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "", limit: 100 }),
  });
  const objects = await objectsRes.json();
  console.log("Objects in store-rewards bucket root:", objects);

  const rewardsObjectsRes = await fetch(`${supabaseUrl}/storage/v1/object/list/store-rewards`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "rewards", limit: 100 }),
  });
  const rewardsObjects = await rewardsObjectsRes.json();
  console.log("Objects in store-rewards/rewards:", rewardsObjects);

  console.log("\n=== STEP 4: DIRECT HTTP TEST OF STORED IMAGE URLS ===");
  for (const row of catalogRows || []) {
    if (row.image_url) {
      try {
        console.log(`\nTesting URL for "${row.title}":`);
        console.log(`  URL: ${row.image_url}`);
        const res = await fetch(row.image_url, { method: "GET" });
        console.log(`  HTTP Status: ${res.status} ${res.statusText}`);
        console.log(`  Content-Type: ${res.headers.get("content-type")}`);
        console.log(`  Content-Length: ${res.headers.get("content-length")} bytes`);
        console.log(`  Cache-Control: ${res.headers.get("cache-control")}`);
      } catch (err: any) {
        console.error(`  Fetch error:`, err.message);
      }
    }
  }
}

main().catch(console.error);


