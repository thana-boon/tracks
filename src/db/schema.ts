import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Track (วิชาเสริม ม.4-6) — Postgres schema.
 *
 * Identity (students, teachers, academic years, homerooms) is OWNED by the
 * SchoolOS Users Service and only mirrored here via sync — this app never
 * edits those rows by hand. Everything else (groups, subjects, custom rooms,
 * assignments, attendance) is owned by this app.
 */

// ── enums ────────────────────────────────────────────────────
export const personType = pgEnum('person_type', ['student', 'teacher']);
export const attendanceSlot = pgEnum('attendance_slot', ['morning', 'afternoon']);

// ── local admin accounts (fallback — not from SchoolOS) ─────
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── academic years (synced read-only from Users Service) ────
export const academicYears = pgTable('academic_years', {
  id: serial('id').primaryKey(),
  /** id of the year row in the Users Service */
  schoolosId: integer('schoolos_id').notNull().unique(),
  /** Thai Buddhist year, e.g. "2569" */
  year: text('year').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').notNull().default(false),
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
});

// ── people (students ม.4-6 + teachers, synced from Users Service) ──
export const people = pgTable(
  'people',
  {
    id: serial('id').primaryKey(),
    type: personType('type').notNull(),
    /** id in the Users Service (students.id / teachers.id) */
    schoolosId: integer('schoolos_id').notNull(),
    code: text('code').notNull(),
    prefix: text('prefix'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    fullName: text('full_name').notNull(),
    nickname: text('nickname'),
    gender: text('gender'),
    /** students only: homeroom placement from the Users Service */
    gradeLevel: text('grade_level'),
    classroom: text('classroom'),
    classNumber: integer('class_number'),
    /** teachers only: role reported by the Users Service (teacher | teacher-admin) */
    schoolosRole: text('schoolos_role'),
    status: text('status').notNull().default('studying'),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('people_type_schoolos_id_uq').on(t.type, t.schoolosId),
    index('people_type_code_idx').on(t.type, t.code),
    index('people_grade_room_idx').on(t.gradeLevel, t.classroom),
  ],
);

// ── homeroom advisors (synced from Users Service /homerooms) ─
export const homerooms = pgTable(
  'homerooms',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    gradeLevel: text('grade_level').notNull(),
    classroom: text('classroom').notNull(),
    teacherId: integer('teacher_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    syncedAt: timestamp('synced_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('homerooms_uq').on(t.yearId, t.gradeLevel, t.classroom, t.teacherId),
    index('homerooms_teacher_idx').on(t.teacherId),
  ],
);

// ── สิทธิ์ผู้ดูแลของระบบนี้ (local admin grants) ──────────────
// A teacher promoted to admin *here only*. The Users Service keeps owning its
// own `teacher-admin` role — this table never writes back to it, and revoking a
// grant cannot demote someone who is teacher-admin upstream. One row per
// teacher: revoking deletes the row, and the history lives in activity_logs.
export const adminGrants = pgTable(
  'admin_grants',
  {
    id: serial('id').primaryKey(),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    /** why this teacher was given admin — free text, shown on the สิทธิ์ page */
    note: text('note'),
    grantedBy: text('granted_by').notNull(),
    grantedByName: text('granted_by_name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_grants_person_uq').on(t.personId)],
);

// ── สถานะการซิงก์อัตโนมัติ ───────────────────────────────────
// One row per sync kind, overwritten on every run. The people/years screens read
// it to show when the roster last refreshed itself and whether it succeeded —
// the auto-sync runs in the background, so without this it would be invisible.
export const syncState = pgTable('sync_state', {
  /** 'years' | 'students' | 'teachers' | 'homerooms' */
  kind: text('kind').primaryKey(),
  /** 'auto' | 'manual' */
  trigger: text('trigger').notNull(),
  ok: boolean('ok').notNull(),
  message: text('message'),
  detail: jsonb('detail'),
  durationMs: integer('duration_ms'),
  ranAt: timestamp('ran_at').notNull().defaultNow(),
});

// ── track groups (กลุ่มวิชา, e.g. "ET") ──────────────────────
export const trackGroups = pgTable('track_groups', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── track subjects (วิชาในกลุ่ม) ─────────────────────────────
export const trackSubjects = pgTable(
  'track_subjects',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => trackGroups.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** ครูผู้สอน — free text; the teacher need not exist in SchoolOS */
    teacherName: text('teacher_name'),
    /**
     * ช่วงที่วิชานี้เปิดสอน — ภาคเรียน (1|2) และช่วงในภาคเรียนนั้น (1|2), so a
     * year holds four ช่วง in all. Both are null together for a วิชา nobody has
     * placed yet: the catalogue predates the ช่วง, and an unplaced วิชา has to
     * keep showing up (under “ยังไม่ระบุช่วง”) rather than quietly vanish.
     */
    semester: integer('semester'),
    phase: integer('phase'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('track_subjects_code_uq').on(t.code),
    index('track_subjects_group_idx').on(t.groupId),
    index('track_subjects_phase_idx').on(t.semester, t.phase),
  ],
);

// ── รอบเรียน: one running of a subject in a year ─────────────
// The same วิชา is taught more than once — to a different กลุ่ม, in a different
// room, on different days. A section is that one running; everything that
// varies between runnings (days, room, students, attendance) hangs off it,
// while track_subjects stays the catalogue entry (code, name, teacher).
export const subjectSections = pgTable(
  'subject_sections',
  {
    id: serial('id').primaryKey(),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => trackSubjects.id, { onDelete: 'cascade' }),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    /** what tells two runnings apart — "กลุ่ม 1", "รอบบ่าย ม.5" */
    name: text('name').notNull(),
    /** ห้องที่ใช้เรียน — free text ("อาคาร 3 ห้อง 312") */
    room: text('room'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subject_sections_uq').on(t.subjectId, t.yearId, t.name),
    index('subject_sections_year_idx').on(t.yearId, t.subjectId),
  ],
);

// ── class dates per section ──────────────────────────────────
// The calendar days a section actually meets, picked one by one on the
// assignment screen — a รอบเรียน runs on a handful of named days (often one,
// sometimes three or four), not on a repeating weekday. These rows are the
// schedule: the check-in screen offers only these dates, and evaluation counts
// only these dates.
export const subjectDates = pgTable(
  'subject_dates',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => subjectSections.id, { onDelete: 'cascade' }),
    /** class date, YYYY-MM-DD (school time) */
    date: date('date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subject_dates_uq').on(t.sectionId, t.date),
    index('subject_dates_date_idx').on(t.date),
  ],
);

// ── custom classrooms (ห้องเรียนใหม่ที่ระบบนี้สร้างเอง) ──────
export const classrooms = pgTable(
  'classrooms',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('classrooms_year_name_uq').on(t.yearId, t.name)],
);

export const classroomStudents = pgTable(
  'classroom_students',
  {
    id: serial('id').primaryKey(),
    classroomId: integer('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('classroom_students_uq').on(t.classroomId, t.studentId),
    index('classroom_students_student_idx').on(t.studentId),
  ],
);

// ── register_track: student ↔ subject assignment, per year ──
// Append-only history: un-assigning sets droppedAt, never deletes, so a
// transcript can always reconstruct every year (per spec §4.3).
export const registrations = pgTable(
  'registrations',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => trackSubjects.id, { onDelete: 'restrict' }),
    /** which running of the subject — the roster the student actually sits in */
    sectionId: integer('section_id')
      .notNull()
      .references(() => subjectSections.id, { onDelete: 'restrict' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    assignedBy: text('assigned_by').notNull(),
    droppedAt: timestamp('dropped_at'),
    droppedBy: text('dropped_by'),
  },
  (t) => [
    index('registrations_year_subject_idx').on(t.yearId, t.subjectId),
    index('registrations_section_idx').on(t.sectionId),
    index('registrations_student_idx').on(t.studentId),
  ],
);

// ── attendance: per subject, per date, morning/afternoon ────
export const attendance = pgTable(
  'attendance',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => trackSubjects.id, { onDelete: 'restrict' }),
    /** two sections of one subject can meet the same day — the key is per section */
    sectionId: integer('section_id')
      .notNull()
      .references(() => subjectSections.id, { onDelete: 'restrict' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    /** class date, YYYY-MM-DD (school time) */
    date: date('date').notNull(),
    slot: attendanceSlot('slot').notNull(),
    present: boolean('present').notNull(),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_uq').on(t.sectionId, t.date, t.slot, t.studentId),
    index('attendance_section_idx').on(t.sectionId),
    index('attendance_subject_year_idx').on(t.subjectId, t.yearId),
    index('attendance_student_idx').on(t.studentId),
  ],
);

// ── ตั้งค่าเอกสาร: the letterhead a printed transcript carries ──
// A singleton row (id is always 1). The school's crest, the two people who sign
// a transcript, and their titles are not code — a new ผอ. arrives and the
// document has to follow without a redeploy, so they live here and the หน้า
// ตั้งค่าเอกสาร edits them.
//
// Images are stored inline as `data:image/…;base64,…` rather than as files on
// disk: there are at most three of them, they are small, and keeping them in
// the row means pg_dump backs them up with everything else instead of leaving
// a signed document that cannot be reprinted after a restore.
export const documentSettings = pgTable('document_settings', {
  id: integer('id').primaryKey(),
  schoolName: text('school_name').notNull(),
  documentTitle: text('document_title').notNull(),
  /** ข้อความใต้หัวเรื่อง — e.g. "ระเบียนสะสมวิชาเสริม ม.4-6" */
  documentSubtitle: text('document_subtitle'),
  /** ตราโรงเรียน, data URL */
  logo: text('logo'),
  directorName: text('director_name'),
  directorTitle: text('director_title').notNull(),
  /** ลายเซ็นผู้อำนวยการ, data URL */
  directorSignature: text('director_signature'),
  registrarName: text('registrar_name'),
  registrarTitle: text('registrar_title').notNull(),
  /** ลายเซ็นนายทะเบียนวัดผล, data URL */
  registrarSignature: text('registrar_signature'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── activity logs ────────────────────────────────────────────
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    /** stable actor id: `admin:<id>` or `<role>:person:<id>` */
    actor: text('actor').notNull(),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('activity_logs_created_idx').on(t.createdAt)],
);

// ── Track (สายการเรียน) ─────────────────────────────────────
// A different thing from track_groups/track_subjects above: those are the
// catalogue of วิชาเสริม a student is *assigned* to by an admin. A Track is the
// สายการเรียน a student *chooses for themselves*, once, for one ภาคเรียน — and
// once chosen only an admin can move them.
//
// Scoped to a year *and* a ภาคเรียน because the offer changes between terms,
// and to a set of ระดับชั้น because ม.4 and ม.6 are not offered the same สาย.
export const tracks = pgTable(
  'tracks',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    /** ภาคเรียน — 1 or 2 */
    semester: integer('semester').notNull(),
    /**
     * กลุ่มวิชาที่สายนี้พานักเรียนไปเรียน — the catalogue group whose วิชา a
     * student gets by choosing this สาย. Null only on a Track created before
     * the link existed: those keep their typed name and simply have no วิชา to
     * show. `restrict` because deleting a กลุ่มวิชา out from under a สาย
     * students have already chosen would leave the choice pointing at nothing.
     */
    groupId: integer('group_id').references(() => trackGroups.id, { onDelete: 'restrict' }),
    /**
     * ช่วงในภาคเรียนที่สายนี้เปิด — 1 or 2, or null for "ทั้งภาคเรียน". It
     * narrows which วิชา of the กลุ่ม the สาย shows: a กลุ่ม usually spreads
     * its วิชา across both ช่วง, and a สาย is offered for one of them.
     */
    phase: integer('phase'),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * เรียนสายนี้แล้วเหมาะกับคณะ/มหาวิทยาลัยอะไร — free text the ผู้ดูแล writes
     * and the นักเรียน reads on หน้ารายละเอียด. Kept apart from `description`
     * because the list shows the one-line description and this is the long
     * answer to a different question.
     */
    admissionNote: text('admission_note'),
    /** ระดับชั้นที่เลือกสายนี้ได้ — ["ม.4","ม.5"]; empty means every ชั้น */
    gradeLevels: jsonb('grade_levels').$type<string[]>().notNull().default([]),
    /**
     * ช่วงเวลาที่เปิดให้นักเรียนเลือก — null on either side means that side is
     * not fenced: no opensAt is "open from the moment it exists", no closesAt
     * is "open until ปิดไม่ให้เลือก". The window only ever governs the
     * นักเรียน's own screen; a ผู้ดูแล edits and places students at any hour.
     */
    opensAt: timestamp('opens_at'),
    closesAt: timestamp('closes_at'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tracks_term_name_uq').on(t.yearId, t.semester, t.name),
    index('tracks_term_idx').on(t.yearId, t.semester),
  ],
);

// ── ข้อย่อยของ Track (แขนงในสาย) ────────────────────────────
// Optional per track: TrackSM splits into กฎหมาย / บริหาร, while another สาย has
// no split at all. A track that has options makes picking one mandatory — a
// half-made choice is not a choice.
export const trackOptions = pgTable(
  'track_options',
  {
    id: serial('id').primaryKey(),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    /** กลุ่มวิชาของแขนงนี้ — set when the แขนง has วิชา of its own to show */
    groupId: integer('group_id').references(() => trackGroups.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    /** display order on the เลือก Track screen */
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('track_options_name_uq').on(t.trackId, t.name),
    index('track_options_track_idx').on(t.trackId),
  ],
);

// ── การเลือก Track ของนักเรียน ──────────────────────────────
// One row per student per ภาคเรียน — that is what "เลือกได้ครั้งเดียว" means, and
// the unique index is what enforces it rather than a check the UI could be
// talked out of. The row is never deleted by a student: an admin moving someone
// updates it in place and `changedBy`/`changedAt` records who did.
export const trackChoices = pgTable(
  'track_choices',
  {
    id: serial('id').primaryKey(),
    yearId: integer('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    semester: integer('semester').notNull(),
    studentId: integer('student_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'restrict' }),
    /** null when the track has no ข้อย่อย */
    optionId: integer('option_id').references(() => trackOptions.id, { onDelete: 'restrict' }),
    /** actor who first made the choice — the student themselves, or an admin */
    chosenBy: text('chosen_by').notNull(),
    chosenAt: timestamp('chosen_at').notNull().defaultNow(),
    /** set only when an admin has since moved them */
    changedBy: text('changed_by'),
    changedAt: timestamp('changed_at'),
  },
  (t) => [
    uniqueIndex('track_choices_term_student_uq').on(t.yearId, t.semester, t.studentId),
    index('track_choices_track_idx').on(t.trackId),
    index('track_choices_student_idx').on(t.studentId),
  ],
);
