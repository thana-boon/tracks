import 'server-only';

/**
 * Server-side client for the SchoolOS Public API (Identity Provider).
 *
 * The API key lives in SCHOOLOS_API_KEY and never leaves the server — the
 * browser talks only to our own /api routes. Includes retry/backoff that
 * honours `Retry-After` on 429 (per API docs).
 */

const BASE = process.env.SCHOOLOS_API_BASE_URL ?? 'http://192.168.200.56:3002';
const KEY = process.env.SCHOOLOS_API_KEY ?? '';

export class SchoolOsError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SchoolOsStudent {
  id: number;
  studentCode: string;
  prefix: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nickname: string | null;
  gender: string | null;
  status: string;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

export interface SchoolOsTeacher {
  id: number;
  teacherCode: string;
  prefix: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  subjectGroup: string | null;
  gradeTaught: string | null;
  role: string;
  employmentStatus: string;
}

export interface SchoolOsHomeroom {
  gradeLevel: string;
  classroom: string;
  studentCount: number;
  homeroomTeachers: {
    id: number;
    teacherCode: string;
    fullName: string;
  }[];
}

export interface SchoolOsAcademicYear {
  id: number;
  year: number | string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface Paged<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  academicYear?: { id: number; year: string };
}

export interface VerifyResult {
  valid: boolean;
  user?: {
    id: number;
    code: string;
    name: string;
    role: string;
    active: boolean;
    status: string;
  };
  error?: { code: string; message: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  if (!KEY) throw new SchoolOsError(500, 'no_key', 'SCHOOLOS_API_KEY is not set');

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'X-API-Key': KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  // Retry on 429 with backoff (max 3 tries), honouring Retry-After seconds.
  if (res.status === 429 && attempt < 3) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2 ** attempt;
    await sleep(retryAfter * 1000);
    return request<T>(path, init, attempt + 1);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string } })?.error;
    throw new SchoolOsError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `SchoolOS ${res.status}`,
    );
  }

  return body as T;
}

export const schoolos = {
  me: () => request<Record<string, unknown>>('/api/public/v1/me'),

  students: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    );
    return request<Paged<SchoolOsStudent>>(
      `/api/public/v1/students?${qs.toString()}`,
    );
  },

  teachers: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    );
    return request<Paged<SchoolOsTeacher>>(
      `/api/public/v1/teachers?${qs.toString()}`,
    );
  },

  /** ครูประจำชั้น per room (scope: teachers:read). */
  homerooms: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    );
    return request<{ data: SchoolOsHomeroom[]; academicYear: { id: number; year: number | string } | null }>(
      `/api/public/v1/homerooms?${qs.toString()}`,
    );
  },

  /**
   * The school calendar (scope: years:read). Falls back to the metadata the
   * roster endpoint carries when the key lacks the years scope, so a key with
   * only students:read still yields the current year.
   */
  async academicYears(): Promise<SchoolOsAcademicYear[]> {
    try {
      const res = await request<{ data: SchoolOsAcademicYear[] }>(
        '/api/public/v1/academic-years',
      );
      return res.data;
    } catch (e) {
      if (e instanceof SchoolOsError && e.status === 403) {
        const meta = await this.currentAcademicYear();
        return meta
          ? [{ id: meta.id, year: meta.year, startDate: null, endDate: null, isActive: true }]
          : [];
      }
      throw e;
    }
  },

  /** The current academic year from roster metadata (works with students:read). */
  async currentAcademicYear(): Promise<{ id: number; year: string } | null> {
    const res = await this.students({ pageSize: 1 });
    return res.academicYear
      ? { id: res.academicYear.id, year: String(res.academicYear.year) }
      : null;
  },

  /** Verify a student/teacher credential against SchoolOS (login only). */
  verify: (role: 'student' | 'teacher', username: string, password: string) =>
    request<VerifyResult>('/api/public/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ role, username, password }),
    }),

  /** Pull every page of studying students in the given grade. */
  async studentsOfGrade(grade: string): Promise<SchoolOsStudent[]> {
    const out: SchoolOsStudent[] = [];
    let page = 1;
    for (;;) {
      const res = await this.students({ grade, status: 'studying', page, pageSize: 200 });
      out.push(...res.data);
      if (page * res.pageSize >= res.total || res.data.length === 0) break;
      page += 1;
    }
    return out;
  },

  async allTeachers(): Promise<SchoolOsTeacher[]> {
    const out: SchoolOsTeacher[] = [];
    let page = 1;
    for (;;) {
      const res = await this.teachers({ status: 'active', page, pageSize: 200 });
      out.push(...res.data);
      if (page * res.pageSize >= res.total || res.data.length === 0) break;
      page += 1;
    }
    return out;
  },
};
