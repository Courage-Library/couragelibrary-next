/** What the shell needs to know about the signed-in user (no DB calls: JWT data only). */
export type ShellAccount = {
  name: string;
  email: string | null;
  /** app_metadata.role is admin or staff: shows the "Admin studio" link (the page authorizes itself). */
  isStaff: boolean;
};
