/**
 * COURAGE LIBRARY — deployed version (TYPES-1 B6, architect ruling).
 *
 * The short git commit SHA of the running deployment, exposed by /api/health as `version` so deploys can be
 * detected (smoke checks wait until `version` equals the pushed commit). Only the 7-character SHA is exposed —
 * no other environment data. Outside Vercel (local builds) the value is "dev"; anything that is not a hex SHA
 * is reported as "unknown".
 */
export function deployedVersion(sha: string | undefined = process.env.VERCEL_GIT_COMMIT_SHA): string {
  if (sha === undefined || sha === "") return "dev";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "unknown";
}
