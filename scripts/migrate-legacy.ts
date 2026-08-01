/**
 * ย้ายข้อมูลจากระบบเดิม (XAMPP / MariaDB `sukhon_track`) เข้าสู่ Track
 *
 *   npx tsx scripts/migrate-legacy.ts <dump.sql>            # dry-run — ไม่เขียนอะไรเลย
 *   npx tsx scripts/migrate-legacy.ts <dump.sql> --commit   # เขียนจริง
 *   npx tsx scripts/migrate-legacy.ts <dump.sql> --commit --wipe   # ล้างของเดิมก่อน
 *
 * อ่านไฟล์ .sql ที่ export จาก phpMyAdmin โดยตรง ไม่ต้องต่อ MySQL
 *
 * ── สิ่งที่ต้องรู้เกี่ยวกับข้อมูลเดิม ────────────────────────────────
 *
 * 1. ภาษาไทยใน dump เป็น mojibake: ข้อความถูกเก็บเป็น UTF-8 แล้วถูกอ่านเป็น
 *    latin1 แล้ว encode เป็น UTF-8 อีกชั้น ("ม" → "à¸¡") ซ่อมได้โดยอ่านไฟล์
 *    เป็น latin1 แล้วตีความ byte เดิมกลับเป็น UTF-8 — ดู fixThai()
 *
 * 2. ระบบเดิมไม่มี "รอบเรียน" แต่มี track_class_sessions ที่ผูก
 *    (วิชา × กลุ่มเรียน × วันที่) ไว้แล้ว และแต่ละคู่ (วิชา, กลุ่มเรียน)
 *    เรียนวันเดียว — คู่นั้นจึงกลายเป็น subject_sections หนึ่งแถวพอดี
 *    โดยตั้งชื่อรอบตามกลุ่มเรียน ("ม.4 กลุ่มเรียนที่ 1")
 *
 * 3. track_registrations ไม่มี group_id — หารอบเรียนของนักเรียนจาก
 *    class_groups.student_codes (นักเรียนอยู่กลุ่มไหน → รอบไหนของวิชานั้น)
 *
 * 4. ระบบเดิมเก็บ attend_morning / attend_afternoon อยู่แล้ว ตรงกับ slot
 *    ของระบบใหม่ 1:1 — หนึ่งแถวเดิมจึงกลายเป็น attendance สองแถว
 *    (แถวที่เป็น NULL ทั้งคู่ = สร้างวันเรียนไว้แต่ยังไม่เช็คชื่อ → ข้าม)
 *
 * 5. ผลการเรียน (result_status) ของเดิม *ไม่ต้องย้าย* — ระบบใหม่คำนวณสดจาก
 *    การเช็คชื่อใน src/lib/evaluate.ts ด้วยเกณฑ์เดียวกัน
 */
import 'dotenv/config';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db';
import {
  academicYears,
  attendance,
  classroomStudents,
  classrooms,
  people,
  registrations,
  subjectDates,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '../src/db/schema';

/** ปีการศึกษาปลายทาง และ year_id ของระบบเดิมที่ตรงกับปีนั้น */
const TARGET_YEAR = '2569';
const LEGACY_YEAR_ID = '3';
/** ค่าที่ใส่ในช่อง assigned_by / recorded_by เพื่อให้ตามรอยได้ว่ามาจากการย้าย */
const ACTOR = 'migration:sukhon_track';

// ── อ่าน dump ────────────────────────────────────────────────────────

/**
 * แกะ `INSERT INTO tbl (...) VALUES (...),(...)` เป็น array ของ array
 * เขียนเองเพราะ dump มี escape (\r\n, \', \\) ที่ split ด้วย regex ไม่ได้
 */
function parseInserts(dump: string, table: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  const re = new RegExp('INSERT INTO `' + table + '` \\([^)]*\\) VALUES\\s*', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(dump))) {
    let i = m.index + m[0].length;
    while (i < dump.length) {
      while (i < dump.length && /[\s,]/.test(dump[i])) i++;
      if (dump[i] === ';') break;
      if (dump[i] !== '(') break;
      i++;
      const vals: string[] = [];
      let cur = '';
      let inStr = false;
      for (;;) {
        const c = dump[i];
        if (inStr) {
          if (c === '\\') {
            const e = dump[i + 1];
            cur += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e;
            i += 2;
            continue;
          }
          if (c === "'") {
            inStr = false;
            i++;
            continue;
          }
          cur += c;
          i++;
          continue;
        }
        if (c === "'") {
          inStr = true;
          i++;
          continue;
        }
        if (c === ',') {
          vals.push(cur.trim());
          cur = '';
          i++;
          continue;
        }
        if (c === ')') {
          vals.push(cur.trim());
          i++;
          break;
        }
        cur += c;
        i++;
      }
      rows.push(vals.map((v) => (v === 'NULL' ? null : v)));
    }
  }
  return rows;
}

/** ซ่อมภาษาไทยที่ถูก encode ซ้อนสองชั้น (ดูหมายเหตุ 1 ด้านบน) */
const fixThai = (s: string | null) =>
  s == null ? s : Buffer.from(s, 'latin1').toString('utf8');

const splitCodes = (s: string | null) =>
  (s ?? '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const commit = args.includes('--commit');
  const wipe = args.includes('--wipe');
  if (!file) throw new Error('usage: tsx scripts/migrate-legacy.ts <dump.sql> [--commit] [--wipe]');

  // latin1 เพื่อรักษา byte เดิมไว้ให้ fixThai() ตีความ
  const dump = fs.readFileSync(file, 'latin1');
  const skipped: string[] = [];

  // ── ปีการศึกษาปลายทาง ──────────────────────────────────────────
  const [year] = await db
    .select({ id: academicYears.id, year: academicYears.year })
    .from(academicYears)
    .where(eq(academicYears.year, TARGET_YEAR));
  if (!year)
    throw new Error(
      `ไม่พบปีการศึกษา ${TARGET_YEAR} ในระบบใหม่ — ต้อง sync ปีการศึกษาจาก SchoolOS ก่อน`,
    );

  // ── นักเรียนในระบบใหม่ (รหัส → id) ─────────────────────────────
  const roster = await db
    .select({ id: people.id, code: people.code })
    .from(people)
    .where(eq(people.type, 'student'));
  const studentId = new Map(roster.map((p) => [p.code, p.id]));

  // ── ข้อมูลเดิม ─────────────────────────────────────────────────
  const lGroups = parseInserts(dump, 'track_groups'); // id,title,is_active,...
  const lSubjects = parseInserts(dump, 'track_subjects'); // id,title,desc,active,c,u,group_id,code
  const lClassGroups = parseInserts(dump, 'class_groups'); // id,title,student_codes,...
  const lSessions = parseInserts(dump, 'track_class_sessions'); // id,year,subject,date,note,c,u,term,group
  const lAttend = parseInserts(dump, 'track_class_students'); // session,code,legacy,result,checked,morning,afternoon
  const lRegs = parseInserts(dump, 'track_registrations'); // id,year,code,subject,created,term,result

  // นักเรียนอยู่กลุ่มเรียนไหน — ใช้หา "รอบเรียน" ของแต่ละการลงทะเบียน
  const groupOfStudent = new Map<string, string>();
  for (const cg of lClassGroups)
    for (const code of splitCodes(cg[2])) groupOfStudent.set(code, cg[0]!);

  const subjectExists = new Set(lSubjects.map((s) => s[0]!));

  // เฉพาะคาบที่ผูกกลุ่มเรียนและอยู่ในปีเป้าหมาย (คาบเก่า 3 แถวไม่มีกลุ่ม + วิชาถูกลบไปแล้ว)
  const sessions = lSessions.filter((s) => {
    if (s[1] !== LEGACY_YEAR_ID || !s[8]) return false;
    if (!subjectExists.has(s[2]!)) {
      skipped.push(`คาบเรียน #${s[0]} — วิชา #${s[2]} ถูกลบจากระบบเดิมแล้ว`);
      return false;
    }
    return true;
  });

  // ── รอบเรียน = ทุกคู่ (วิชา, กลุ่มเรียน) ที่มีคาบเรียน *หรือ* มีคนลงทะเบียน ──
  // คู่ที่ยังไม่มีคาบจะได้รอบเรียนที่ยังไม่มีวันเรียน ซึ่งถูกต้อง: ลงทะเบียนแล้ว
  // แต่ยังไม่ได้กำหนดวันเรียน
  const sectionKeys = new Set<string>();
  for (const s of sessions) sectionKeys.add(`${s[2]}|${s[8]}`);

  // ── ทะเบียนตัวจริงของระบบเดิมคือ "รายชื่อในคาบ" ไม่ใช่ track_registrations ──
  //
  // ระบบเดิมมีตาราง track_registrations อยู่ แต่มันไม่ครบ (2,061 คู่ จากที่จริง
  // 2,613) เพราะเขียนเฉพาะบางจังหวะ ส่วนหน้าจอผลการเรียนของระบบเดิมอ่านจาก
  // track_class_students คือรายชื่อที่อยู่ในคาบจริง ๆ ยึดตาราง registrations
  // เป็นหลักเมื่อไหร่ วิชาที่เช็คชื่อไปแล้วแต่ไม่มีแถวลงทะเบียนจะหายจาก
  // ทรานสคริปต์ทันที — ตรวจแล้วว่ารายชื่อในคาบครอบคลุมทุกแถวของ registrations
  // (คู่ที่ "มีลงทะเบียนแต่ไม่มีเช็คชื่อ" = 0) จึงใช้รายชื่อในคาบเป็นแหล่งเดียว
  const sessionById = new Map(sessions.map((s) => [s[0]!, s]));

  /** เวลาลงทะเบียนเดิม ถ้ามี — ไว้ใช้เป็น assignedAt ให้ตรงของเก่าที่สุด */
  const legacyRegAt = new Map<string, string>();
  for (const r of lRegs) {
    if (r[1] !== LEGACY_YEAR_ID) continue;
    legacyRegAt.set(`${r[2]}|${r[3]}`, r[4]!);
  }

  type Enrolment = { key: string; code: string; at: string };
  const enrolments: Enrolment[] = [];
  const enrolSeen = new Set<string>();
  const missingStudent = new Set<string>();

  type AttRow = { key: string; date: string; code: string; slot: 'morning' | 'afternoon'; present: boolean; at: string | null };
  const attRows: AttRow[] = [];
  let uncheckedRows = 0;

  for (const a of lAttend) {
    const s = sessionById.get(a[0]!);
    if (!s) continue; // คาบที่ข้ามไปแล้ว
    if (!studentId.has(a[1]!)) {
      missingStudent.add(a[1]!);
      continue;
    }
    const key = `${s[2]}|${s[8]}`;

    // ลงทะเบียน — รวมแถวที่ยังไม่ได้เช็คชื่อด้วย เพราะนักเรียนถูกจัดเข้ารอบนั้นแล้ว
    const dedup = `${a[1]}|${key}`;
    if (!enrolSeen.has(dedup)) {
      enrolSeen.add(dedup);
      enrolments.push({ key, code: a[1]!, at: legacyRegAt.get(`${a[1]}|${s[2]}`) ?? s[5]! });
    }

    // เช็คชื่อ — เฉพาะช่องที่ครูกดจริง
    if (a[5] == null && a[6] == null) {
      uncheckedRows++;
      continue;
    }
    for (const [idx, slot] of [[5, 'morning'], [6, 'afternoon']] as const) {
      if (a[idx] == null) continue;
      attRows.push({ key, date: s[3]!, code: a[1]!, slot, present: a[idx] === '1', at: a[4] });
    }
  }

  for (const code of missingStudent)
    skipped.push(`ไม่พบรหัสนักเรียน ${code} ในระบบใหม่ — ข้ามทั้งลงทะเบียนและเช็คชื่อ`);

  // เทียบกับตารางเดิมไว้ให้เห็นว่าเพิ่มมาจากรายชื่อในคาบเท่าไร
  const legacyPairs = new Set(
    lRegs
      .filter((r) => r[1] === LEGACY_YEAR_ID && subjectExists.has(r[3]!))
      .map((r) => `${r[2]}|${r[3]}`),
  );
  const rosterPairs = new Set(enrolments.map((r) => `${r.code}|${r.key.split('|')[0]}`));
  const onlyInRoster = [...rosterPairs].filter((k) => !legacyPairs.has(k)).length;
  const onlyInLegacy = [...legacyPairs].filter((k) => !rosterPairs.has(k));

  // ── รายงาน ─────────────────────────────────────────────────────
  const legacyCodes = new Set([...groupOfStudent.keys()]);
  const unmatched = [...legacyCodes].filter((c) => !studentId.has(c));

  console.log('═══ แผนการย้ายข้อมูล ═══');
  console.log(`ปีการศึกษาปลายทาง : ${year.year} (academic_years.id=${year.id})`);
  console.log(`กลุ่มวิชา          : ${lGroups.length}`);
  console.log(`วิชา               : ${lSubjects.length}`);
  console.log(`กลุ่มพิเศษ         : ${lClassGroups.length} (นักเรียน ${legacyCodes.size} คน)`);
  console.log(`รอบเรียน           : ${sectionKeys.size}`);
  console.log(`วันเรียน           : ${sessions.length}`);
  console.log(`ลงทะเบียน          : ${enrolments.length}  (ตาราง track_registrations เดิมมีแค่ ${legacyPairs.size} → รายชื่อในคาบเพิ่มให้อีก ${onlyInRoster})`);
  console.log(`เช็คชื่อ           : ${attRows.length} แถว`);
  console.log(`\nยังไม่ได้เช็คชื่อ : ${uncheckedRows} รายการ (ลงทะเบียนไว้แล้ว วันเรียนถูกสร้างแล้ว รอครูเช็ค)`);
  if (onlyInLegacy.length)
    console.log(`มีในตารางลงทะเบียนเดิมแต่ไม่มีในคาบใดเลย : ${onlyInLegacy.length} ${JSON.stringify(onlyInLegacy.slice(0, 5))}`);
  console.log(`รหัสนักเรียนที่ไม่พบในระบบใหม่ : ${unmatched.length} ${JSON.stringify(unmatched)}`);
  if (skipped.length) {
    console.log(`\n── ข้ามทั้งหมด ${skipped.length} รายการ ──`);
    for (const s of skipped.slice(0, 20)) console.log('  •', s);
    if (skipped.length > 20) console.log(`  … อีก ${skipped.length - 20} รายการ`);
  }

  if (!commit) {
    console.log('\n[dry-run] ยังไม่เขียนอะไรลงฐานข้อมูล — ใส่ --commit เพื่อย้ายจริง');
    return;
  }

  // ── เขียนจริง (transaction เดียว — ล้มเหลวเมื่อไหร่ย้อนกลับหมด) ──
  await db.transaction(async (tx) => {
    if (wipe) {
      // ลบตามลำดับ FK; ไม่แตะ people / academic_years / admins ที่ sync มาจาก SchoolOS
      await tx.delete(attendance);
      await tx.delete(registrations);
      await tx.delete(subjectDates);
      await tx.delete(subjectSections);
      await tx.delete(classroomStudents);
      await tx.delete(classrooms);
      await tx.delete(trackSubjects);
      await tx.delete(trackGroups);
      console.log('[wipe] ล้างข้อมูลเดิมของแอปแล้ว');
    }

    // กลุ่มวิชา — ระบบใหม่ต้องมี code ที่ไม่ซ้ำ ระบบเดิมไม่มี จึงย่อจากชื่อ
    const GROUP_CODE: Record<string, string> = {
      'Engineering Technology': 'ET',
      'PRE-Track': 'PRE',
      Medical: 'MED',
      'Social and Management': 'SM',
    };
    const groupId = new Map<string, number>();
    for (const g of lGroups) {
      const name = fixThai(g[1])!;
      const code = GROUP_CODE[name] ?? name.slice(0, 8).toUpperCase();
      const [row] = await tx
        .insert(trackGroups)
        .values({ code, name, active: g[2] === '1' })
        .returning({ id: trackGroups.id });
      groupId.set(g[0]!, row.id);
    }

    // วิชา
    const subjectId = new Map<string, number>();
    for (const s of lSubjects) {
      const [row] = await tx
        .insert(trackSubjects)
        .values({
          groupId: groupId.get(s[6]!)!,
          code: s[7]!,
          name: fixThai(s[1])!,
          description: fixThai(s[2]),
          active: s[3] === '1',
        })
        .returning({ id: trackSubjects.id });
      subjectId.set(s[0]!, row.id);
    }

    // กลุ่มพิเศษ + สมาชิก
    for (const cg of lClassGroups) {
      const [room] = await tx
        .insert(classrooms)
        .values({
          yearId: year.id,
          name: fixThai(cg[1])!,
          note: 'ย้ายจากระบบเดิม',
        })
        .returning({ id: classrooms.id });
      const members = splitCodes(cg[2])
        .map((code) => studentId.get(code))
        .filter((id): id is number => id != null)
        .map((sid) => ({ classroomId: room.id, studentId: sid }));
      for (const c of chunk(members, 500)) await tx.insert(classroomStudents).values(c);
    }

    // รอบเรียน — ตั้งชื่อรอบตามกลุ่มเรียน
    const classGroupName = new Map(lClassGroups.map((c) => [c[0]!, fixThai(c[1])!]));
    const sectionId = new Map<string, number>();
    for (const key of sectionKeys) {
      const [subj, grp] = key.split('|');
      const [row] = await tx
        .insert(subjectSections)
        .values({
          subjectId: subjectId.get(subj)!,
          yearId: year.id,
          name: classGroupName.get(grp) ?? `กลุ่ม ${grp}`,
        })
        .returning({ id: subjectSections.id });
      sectionId.set(key, row.id);
    }

    // วันเรียน
    const dateRows = sessions.map((s) => ({
      sectionId: sectionId.get(`${s[2]}|${s[8]}`)!,
      date: s[3]!,
    }));
    for (const c of chunk(dateRows, 500)) await tx.insert(subjectDates).values(c);

    // ลงทะเบียน
    const regRows = enrolments.map((r) => ({
      yearId: year.id,
      subjectId: subjectId.get(r.key.split('|')[0])!,
      sectionId: sectionId.get(r.key)!,
      studentId: studentId.get(r.code)!,
      assignedAt: new Date(r.at),
      assignedBy: ACTOR,
    }));
    for (const c of chunk(regRows, 500)) await tx.insert(registrations).values(c);

    // เช็คชื่อ
    const attInsert = attRows.map((a) => {
      const [subj] = a.key.split('|');
      return {
        yearId: year.id,
        subjectId: subjectId.get(subj)!,
        sectionId: sectionId.get(a.key)!,
        studentId: studentId.get(a.code)!,
        date: a.date,
        slot: a.slot,
        present: a.present,
        recordedBy: ACTOR,
        recordedAt: a.at ? new Date(a.at) : new Date(),
      };
    });
    for (const c of chunk(attInsert, 500)) await tx.insert(attendance).values(c);

    console.log('\n✓ ย้ายข้อมูลเรียบร้อย');
  });
}

main()
  .then(() => sql.end())
  .catch((e) => {
    console.error('[migrate-legacy] ล้มเหลว:', e);
    process.exitCode = 1;
    return sql.end();
  });
