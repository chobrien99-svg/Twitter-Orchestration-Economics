import { SupabaseClient } from "@supabase/supabase-js";

export type CostMap = Map<string, number>;

/**
 * Returns total estimated spend in USD for the current UTC day.
 * Uses the budget_ledger_occurred_at_idx btree index via a range filter.
 */
export async function getTodaysSpendUsd(supabase: SupabaseClient): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("budget_ledger")
    .select("estimated_cost_usd")
    .gte("occurred_at", startOfDay.toISOString());

  if (error) throw new Error(`getTodaysSpendUsd failed: ${error.message}`);

  return (data ?? []).reduce((sum, row) => sum + Number(row.estimated_cost_usd), 0);
}

/**
 * Loads the cost_estimates reference table into a Map keyed by api_operation.
 */
export async function getCostMap(supabase: SupabaseClient): Promise<CostMap> {
  const { data, error } = await supabase
    .from("cost_estimates")
    .select("api_operation, unit_cost_usd");

  if (error) throw new Error(`getCostMap failed: ${error.message}`);

  return new Map((data ?? []).map((row) => [row.api_operation as string, Number(row.unit_cost_usd)]));
}
