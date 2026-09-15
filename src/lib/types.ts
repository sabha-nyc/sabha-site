export type DinnerStatus = "draft" | "open" | "closed";

export type SignupStatus =
  | "pending"
  | "paid"
  | "cancelled"
  | "refunded"
  | "comped"
  | "transferred"
  | "overbooked";

export type Dinner = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  neighborhood: string | null;
  full_address: string | null;
  price_cents: number;
  seats_total: number;
  access_code: string;
  details_note: string | null;
  host_phone: string | null;
  status: DinnerStatus;
  requires_code: boolean;
  created_at: string;
};

export type Signup = {
  id: string;
  dinner_id: string;
  name: string;
  phone: string;
  dietary_restrictions: string | null;
  email: string | null;
  status: SignupStatus;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  amount_paid_cents: number | null;
  details_token: string | null;
  hold_expires_at: string | null;
  created_at: string;
  paid_at: string | null;
};
