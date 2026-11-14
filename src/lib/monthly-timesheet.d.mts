export type WorkingDayEntry = { id: string; working_date: string; status: "claimed" | "approved" | "returned" | "rejected" };

export function summarizeWorkingDayEntries(
  entries: WorkingDayEntry[] | null | undefined,
  month: string,
): {
  sourceRecords: WorkingDayEntry[];
  totalSubmitted: number;
  verified: number;
  pending: number;
  rejected: number;
  returned: number;
  eligibility: "no_records" | "ready_for_review" | "incomplete";
};

export function canDecideMonthlyTimesheet(role: string, status: string, note: string): boolean;
