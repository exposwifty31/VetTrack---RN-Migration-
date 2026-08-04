export type QuickScanToggleAction = "checked_out" | "returned";

export type MeUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  clinicId?: string | null;
  status?: string;
};

export type QuickScanToggleResult = {
  equipment: { id: string; name?: string; status?: string };
  action: QuickScanToggleAction;
  scanLogId: string;
  undoToken: string;
  checkedOutByEmail?: string;
};

export type OutboxHead = { maxPublishedId: number };
