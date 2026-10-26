/** F9-B view types shared by the server read model (pro-server.ts) and the pricing client. Types only. */
export interface ProPlanView {
  planCode: string;
  label: string;
  badge: string | null;
  pricePaise: number;
  durationMonths: number;
  isFounding: boolean;
}

export interface ProAccountView {
  signedIn: boolean;
  adultConfirmed: boolean;
  /** latest end of the user's active paid / granted Pro (a new period starts here); null = none or open-ended */
  currentEnd: string | null;
  unlimited: boolean;
  foundingBuyer: boolean;
}
