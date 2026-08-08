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

/**
 * Scheduling metadata for the create/edit assignee picker (Slice 3b) — the
 * shape of `GET /api/appointments/meta?day=`, verified against the route's
 * response builder (server/routes/appointments.ts `router.get("/meta")`):
 * `{ day, vets, technicians }`, each staff row carrying that day's roster
 * shifts so the picker can surface who is actually on shift.
 */
export type TaskMetaShift = {
  id: string;
  employeeName: string;
  /** Roster clock strings (HH:MM:SS) — not ISO. */
  startTime: string;
  endTime: string;
  role: string | null;
};

export type TaskMetaStaff = {
  id: string;
  /** Both nullable in `vt_users`; the picker falls back id-ward. */
  name: string | null;
  displayName: string | null;
  role: string;
  shifts: TaskMetaShift[];
};

export type TaskMeta = {
  day: string;
  vets: TaskMetaStaff[];
  technicians: TaskMetaStaff[];
};

/**
 * Create/update request bodies — the assignable subset of the server's
 * appointment schema (server/routes/appointments.ts `createAppointmentSchema` /
 * `updateAppointmentSchema`). `startTime`/`endTime` MUST be timezone-qualified
 * ISO strings (the service's `toUtcDate` rejects offset-less input with
 * `TIMEZONE_REQUIRED`). `vetId` is the assignee; `animalId`/`ownerId` are the
 * repurposed free-text device/location columns.
 */
export type TaskCreateInput = {
  startTime: string;
  endTime: string;
  notes?: string | null;
  vetId?: string | null;
  animalId?: string | null;
  ownerId?: string | null;
  priority?: TaskPriority;
  taskType?: TaskType | null;
  status?: TaskStatus;
  appointmentType?: string | null;
};

/** PATCH body — every field optional; the server requires ≥1 (send only the diff). */
export type TaskUpdateInput = Partial<TaskCreateInput>;
