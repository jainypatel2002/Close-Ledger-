export type Role = "ADMIN" | "STAFF";

export type ClosingStatus = "DRAFT" | "SUBMITTED" | "FINALIZED" | "LOCKED";

export type TaxMode = "AUTO" | "MANUAL";
export type PaymentType = "cash" | "card" | "ebt" | "other";

export type PermissionKey =
  | "can_view_history"
  | "can_print_pdf"
  | "can_view_reports"
  | "can_export_data"
  | "can_create_closing"
  | "can_view_only_own_entries";

export type PermissionMap = Partial<Record<PermissionKey, boolean>>;

export interface Store {
  id: string;
  owner_id: string | null;
  store_name: string;
  legal_name: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  email: string | null;
  header_text: string | null;
  tax_rate_default: number;
  timezone: string;
  scratch_bundle_size_default: number;
  include_billpay_in_gross: boolean;
  include_lottery_in_gross: boolean;
  allow_staff_view_history: boolean;
  allow_staff_print_pdf: boolean;
  allow_staff_export: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreMember {
  id: string;
  store_id: string;
  user_id: string;
  role: Role;
  is_active: boolean;
  permissions: PermissionMap;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LotteryMasterEntry {
  id: string;
  store_id: string;
  display_number: number;
  name: string;
  ticket_price: number;
  default_bundle_size: number;
  is_active: boolean;
  is_locked: boolean;
  notes: string | null;
  created_by_app_user_id: string | null;
  updated_by_app_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClosingCategoryLine {
  id: string;
  closing_day_id: string;
  category_name: string;
  amount: number;
  taxable: boolean;
  created_at: string;
  updated_at: string;
}

export interface LotteryScratchLine {
  id: string;
  closing_day_id: string;
  store_id: string;
  lottery_master_entry_id: string | null;
  lottery_number_snapshot: number;
  display_number_snapshot: number;
  lottery_name_snapshot: string;
  amount_snapshot: number;
  ticket_price_snapshot: number;
  bundle_size_snapshot: number;
  is_locked_snapshot: boolean;
  start_number: number;
  end_number: number;
  tickets_sold: number;
  sales_amount: number;
  payouts: number;
  net_amount: number;
  manual_override_reason: string | null;
  game_name: string;
  pack_id: string | null;
  start_ticket_number: number;
  end_ticket_number: number;
  inclusive_count: boolean;
  bundle_size: number;
  ticket_price: number;
  tickets_sold_override: number | null;
  override_reason: string | null;
  tickets_sold_computed: number;
  scratch_sales: number;
  scratch_payouts: number;
  created_by_app_user_id: string | null;
  updated_by_app_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillpayLine {
  id: string;
  closing_day_id: string;
  provider_name: string;
  amount_collected: number;
  fee_revenue: number;
  txn_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentLine {
  id: string;
  closing_day_id: string;
  store_id: string;
  payment_type: PaymentType;
  label: string;
  amount: number;
  sort_order: number;
  created_by_app_user_id: string | null;
  updated_by_app_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClosingDay {
  id: string;
  store_id: string;
  business_date: string;
  created_by: string | null;
  updated_by: string | null;
  status: ClosingStatus;
  locked_at: string | null;
  locked_by: string | null;
  submitted_at: string | null;
  finalized_at: string | null;
  tax_mode: TaxMode;
  tax_rate_used: number;
  tax_amount: number;
  tax_amount_manual: number | null;
  tax_override_enabled: boolean;
  total_sales_gross: number;
  taxable_sales: number;
  non_taxable_sales: number;
  draw_sales: number;
  draw_payouts: number;
  lottery_total_scratch_revenue: number;
  lottery_online_amount: number;
  lottery_paid_out_amount: number;
  lottery_amount_due: number;
  lottery_total_sales: number;
  lottery_total_payouts: number;
  lottery_net: number;
  billpay_collected_total: number;
  billpay_fee_revenue: number;
  billpay_transactions_count: number;
  cash_amount: number;
  card_amount: number;
  ebt_amount: number;
  other_amount: number;
  payments_total: number;
  cash_over_short: number;
  notes: string | null;
  include_billpay_in_gross: boolean;
  include_lottery_in_gross: boolean;
  gross_collected: number;
  true_revenue: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ClosingDocument {
  id: string;
  closing_day_id: string | null;
  store_id: string;
  created_by: string;
  file_name: string;
  bucket_path: string;
  public_url: string | null;
  document_type: "closing_pdf" | "monthly_report_pdf";
  report_year: number | null;
  report_month: number | null;
  source: "SERVER" | "CLIENT_OFFLINE";
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  store_id: string | null;
  closing_day_id: string | null;
  table_name: string;
  row_id: string | null;
  action_type: string;
  actor_id: string | null;
  reason: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ClosingInput {
  id: string;
  store_id: string;
  business_date: string;
  status: ClosingStatus;
  tax_mode: TaxMode;
  tax_rate_used: number;
  tax_amount?: number;
  tax_override_enabled: boolean;
  tax_amount_manual?: number | null;
  lottery_total_scratch_revenue: number;
  lottery_online_amount: number;
  lottery_paid_out_amount: number;
  lottery_amount_due: number;
  draw_sales: number;
  draw_payouts: number;
  cash_amount: number;
  card_amount: number;
  ebt_amount: number;
  other_amount: number;
  payments_total?: number;
  notes?: string;
  include_billpay_in_gross: boolean;
  include_lottery_in_gross: boolean;
  category_lines: Array<{
    id: string;
    category_name: string;
    amount: number;
    taxable: boolean;
  }>;
  lottery_lines: Array<{
    id: string;
    lottery_master_entry_id?: string | null;
    lottery_number_snapshot?: number;
    display_number_snapshot?: number;
    lottery_name_snapshot?: string;
    amount_snapshot?: number;
    ticket_price_snapshot?: number;
    bundle_size_snapshot?: number;
    is_locked_snapshot?: boolean;
    game_name?: string;
    pack_id?: string;
    start_number?: number;
    end_number?: number;
    start_ticket_number?: number;
    end_ticket_number?: number;
    inclusive_count: boolean;
    bundle_size?: number;
    ticket_price?: number;
    tickets_sold_override?: number | null;
    override_reason?: string | null;
    manual_override_reason?: string;
    payouts?: number;
    scratch_payouts?: number;
  }>;
  billpay_lines: Array<{
    id: string;
    provider_name: string;
    amount_collected: number;
    fee_revenue: number;
    txn_count: number;
  }>;
  payment_lines: Array<{
    id: string;
    payment_type: PaymentType;
    label: string;
    amount: number;
    sort_order: number;
  }>;
  reopen_reason?: string;
}

export interface ClosingComputedTotals {
  product_sales_total: number;
  taxable_sales: number;
  non_taxable_sales: number;
  lottery_total_scratch_revenue: number;
  lottery_online_amount: number;
  lottery_paid_out_amount: number;
  lottery_amount_due: number;
  lottery_total_sales: number;
  lottery_total_payouts: number;
  lottery_net: number;
  billpay_collected_total: number;
  billpay_fee_revenue: number;
  billpay_transactions_count: number;
  cash_amount: number;
  card_amount: number;
  ebt_amount: number;
  other_amount: number;
  gross_collected: number;
  true_revenue: number;
  tax_amount: number;
  payments_total: number;
  cash_over_short: number;
  total_sales_gross: number;
}

export interface AuthContextData {
  userId: string;
  activeStoreId: string | null;
  membership: StoreMember | null;
}

export interface SyncMutation {
  id: string;
  type:
    | "UPSERT_STORE"
    | "UPSERT_CLOSING"
    | "UPSERT_LOTTERY_MASTER"
    | "DELETE_LOTTERY_MASTER"
    | "DELETE_CLOSING"
    | "UPLOAD_DOCUMENT"
    | "UPDATE_MEMBER";
  store_id: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  status: "PENDING" | "PROCESSING" | "FAILED";
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}
