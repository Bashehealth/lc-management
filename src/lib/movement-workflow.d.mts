export const managementDecisionStatuses: string[];
export function hasRequiredDecisionNote(note: unknown): boolean;
export function canStateReview(status: string): boolean;
export function canManagementDecide(status: string): boolean;
export function canLgaResubmit(status: string): boolean;
export function validateMovementSubmission(input: { destination: string; reason: string; departure: string; expectedReturn: string }): string | null;
