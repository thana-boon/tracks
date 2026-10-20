import 'server-only';
import { TRACK_GRADES } from './utils';
import {
  subjectKey,
  type PeriodKey,
  type ScoreCell,
  type ScorePeriod,
  type ScoreSubject,
} from './score-rank';

/**
 * Server-side client for the SchoolOS score service's Public API
 * (/score/api/public/v1) — คะแนนสอบกลางภาค/ปลายภาค.
 *
 * A different service with a different key from SchoolOS Users (schoolos.ts):
 * SCORE_API is an `sk_score_…` key and needs `exams:read` to read scores
 * at all and `students:identify` to get the รหัสนักเรียน back — without it
 * the rows carry only an id of the score service's own, and nothing ties them
 * to the นักเรียน here. Retake scores never leave that service, whatever the
 * scope, so they are not in anything this file returns.
 */

const BASE = (process.env.SCORE_API_BASE_URL ?? 'http://192.168.200.56:3006/score').replace(/\/$/, '');
const KEY = process.env.SCORE_API ?? '';

/** Max the service allows on /exam-scores. */
const PAGE_SIZE = 500;

/**
 * How long one year's scores are reused before asking again. The score
 * service recomputes the whole result set for every page it serves, so a
 * page that refetched on every visit would cost it far more than it costs us;
 * ดึงคะแนนล่าสุด on the screen drops the copy on demand.
 */
const CACHE_MS = 10 * 60 * 1000;

export interface ScoreBook {
  year: string;
  fetchedAt: string;
  periods: ScorePeriod[];
  subjects: ScoreSubject[];
  /** every score of the year, by รหัสนักเรียน */
  byCode: Record<string, ScoreCell[]>;
}

export type ScoreLoad =
  | { ok: true; book: ScoreBook }
  | { ok: false; code: string; message: string };

interface ApiSubject {
  subjectCode: string;
  subjectName: string;
  fullScore: number;
  score: number | null;
  isAbsent: boolean;
}

interface ApiResult {
  student: { studentCode: string | null; gradeLevel: string };
  period: { semester: number; examType: string; name: string };
  subjects: ApiSubject[];
}

interface ApiPage {
  data: ApiResult[];
  page: number;
  pageSize: number;
  total: number;
}

class ScoreApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, attempt = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/public/v1${path}`, {
      headers: { 'X-API-Key': KEY },
      cache: 'no-store',
    });
  } catch {
    throw new ScoreApiError('unreachable', `ติดต่อระบบคะแนนไม่ได้ (${BASE})`);
  }
  // 429 — wait as long as Retry-After says, at most three times.
  if (res.status === 429 && attempt < 3) {
    await sleep((Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000);
    return request<T>(path, attempt + 1);
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code: string; message: string } })
    | null;
  if (!res.ok) {
    throw new ScoreApiError(
      body?.error?.code ?? `http_${res.status}`,
      body?.error?.message ?? `ระบบคะแนนตอบ ${res.status}`,
    );
  }
  return body as T;
}

async function allPages(params: URLSearchParams): Promise<ApiResult[]> {
  const out: ApiResult[] = [];
  for (let page = 1; ; page++) {
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    const res = await request<ApiPage>(`/exam-scores?${params}`);
    out.push(...res.data);
    if (res.data.length === 0 || page * res.pageSize >= res.total) return out;
  }
}

function isPeriodKey(k: string): k is PeriodKey {
  return ['1-midterm', '1-final', '2-midterm', '2-final'].includes(k);
}

const cache = new Map<string, { at: number; book: ScoreBook }>();

/** Forget a year's copy so the next load asks the score service again. */
export function dropScoreCache(year: string) {
  cache.delete(year);
}

/**
 * Every published กลางภาค/ปลายภาค score of ม.4-6 in one ปีการศึกษา (the
 * Buddhist year as both systems store it, "2568").
 *
 * Fetched per ชั้น rather than for the whole school: the service would
 * otherwise compute ม.1-3 as well, only for us to throw them away.
 */
export async function scoreBookFor(year: string): Promise<ScoreLoad> {
  if (!KEY) {
    return {
      ok: false,
      code: 'no_key',
      message: 'ยังไม่ได้ตั้งค่า SCORE_API — ขอ key (sk_score_…) จากแอดมินระบบคะแนนแล้วใส่ใน .env',
    };
  }
  const hit = cache.get(year);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, book: hit.book };

  let results: ApiResult[];
  try {
    const perGrade = await Promise.all(
      TRACK_GRADES.map((grade) => allPages(new URLSearchParams({ year, grade }))),
    );
    results = perGrade.flat();
  } catch (e) {
    if (e instanceof ScoreApiError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }

  if (results.some((r) => !r.student.studentCode)) {
    return {
      ok: false,
      code: 'no_identity',
      message:
        'key นี้ไม่มี scope students:identify ระบบคะแนนจึงไม่ส่งรหัสนักเรียนมา และจับคู่กับนักเรียนในระบบนี้ไม่ได้ — ขอให้แอดมินระบบคะแนนติ๊ก scope นี้ให้ key',
    };
  }

  const periods = new Map<PeriodKey, ScorePeriod>();
  const subjects = new Map<string, ScoreSubject>();
  const byCode: Record<string, ScoreCell[]> = {};
  for (const r of results) {
    const key = `${r.period.semester}-${r.period.examType}`;
    if (!isPeriodKey(key)) continue;
    periods.set(key, {
      key,
      semester: r.period.semester,
      examType: r.period.examType as ScorePeriod['examType'],
      name: r.period.name,
    });
    const cells = (byCode[r.student.studentCode!] ??= []);
    for (const s of r.subjects) {
      const sk = subjectKey(s.subjectCode, s.subjectName);
      if (!subjects.has(sk)) {
        subjects.set(sk, {
          key: sk,
          code: s.subjectCode,
          name: s.subjectName,
          gradeLevel: r.student.gradeLevel,
        });
      }
      cells.push({
        period: key,
        subject: sk,
        score: s.score,
        fullScore: s.fullScore,
        absent: s.isAbsent,
      });
    }
  }

  const book: ScoreBook = {
    year,
    fetchedAt: new Date().toISOString(),
    periods: [...periods.values()].sort(
      (a, b) => a.semester - b.semester || (a.examType === 'midterm' ? -1 : 1),
    ),
    subjects: [...subjects.values()].sort(
      (a, b) =>
        a.gradeLevel.localeCompare(b.gradeLevel, 'th', { numeric: true }) ||
        a.code.localeCompare(b.code, 'th', { numeric: true }),
    ),
    byCode,
  };
  cache.set(year, { at: Date.now(), book });
  return { ok: true, book };
}
