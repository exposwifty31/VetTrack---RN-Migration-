/**
 * Wire contract types for the Tasks domain (Slice 3).
 *
 * A "task" IS a serialized `vt_appointments` row — the server route stays
 * `/api/appointments` (frozen namespace; only the rendered copy says "Tasks").
 * Shape verified against vettrack `serializeAppointment()` in
 * server/services/appointments.service.ts (2026-08-07): timestamps are ISO
 * strings, absent optionals are null. The legacy field names survive the task
 * re-purposing — `animalId` carries a free-text device/equipment reference and
 * `ownerId` a free-text location (the web Tasks page writes them exactly so).
 */

export const TASK_STATUSES = [
  "pending",
  "assigned",
  "scheduled",
  "arrived",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["critical", "high", "normal"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TYPES = ["maintenance", "repair", "inspection"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/**
 * Status/priority/taskType are modelled as `string` (with the known unions
 * above exported for derivations) so an unknown server value degrades to the
 * neutral rendering path instead of a crash — the EquipmentRow tolerance idiom.
 */
export type Task = {
  id: string;
  /** Assignee user id (vet OR technician — the legacy column name is `vetId`). */
  vetId: string | null;
  /** Legacy column re-purposed as free-text device/equipment reference. */
  animalId?: string | null;
  /** Legacy column re-purposed as free-text location. */
  ownerId?: string | null;
  startTime: string;
  endTime: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  status: string;
  priority?: string | null;
  taskType?: string | null;
  notes?: string | null;
  appointmentType?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
