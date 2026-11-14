export type ProgrammeState = { code: string; name: string };
export type BossStateSummary = {
  state_id: string;
  state_code: string;
  state_name: string;
  registered_lgas: number;
  active_lgas: number | null;
  lga_coordinators: number;
  state_coordinators: number;
  senior_supervisors: number;
  verified_working_days: number;
  pending_working_days: number;
  returned_working_days: number;
  rejected_working_days: number;
};
export function mergeProgrammeStates(directory: readonly ProgrammeState[], rows: readonly BossStateSummary[]): Array<ProgrammeState & Partial<BossStateSummary> & { state_id: string | null; configured: boolean }>;
export function summarizeBossWorkingDays(rows: Array<{ approved_days?: number; pending_days?: number; returned_days?: number; rejected_days?: number }> | null | undefined): { approved: number; pending: number; returned: number; rejected: number };
export function filterBossPersonnel<T extends { state_code: string | null; lga_id: string | null; role: string; full_name: string }>(rows: T[], filters?: { stateCode?: string; lgaId?: string; role?: string; search?: string }): T[];
export function contactLabel(value: unknown): string;
