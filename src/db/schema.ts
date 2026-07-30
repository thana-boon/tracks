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
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('track_subjects_code_uq').on(t.code),
    index('track_subjects_group_idx').on(t.groupId),
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
