import { headers } from 'next/headers';
import { CalendarSearch, ClipboardCheck, KeyRound, TriangleAlert, Workflow } from 'lucide-react';
import { Card, CardHeader, Badge } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';

export const metadata = { title: 'วิธีใช้ API เช็คชื่อ' };

/**
 * วิธีใช้ API — the page handed to whoever builds the other system.
 *
 * Deliberately outside the session gate: that developer usually has no account
 * here, and nothing on the page is a secret — no key, no นักเรียน, only the
 * shape of the two calls. The address in the examples is worked out from the
 * request, so it is right whether the page was opened by name or by IP.
 */
export default async function ApiDocsPage() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3004';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}${withBasePath('/api/public/v1')}`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <header>
        <Badge tone="primary">ระบบวิชาเสริม ม.4-6</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">วิธีใช้ API เช็คชื่อ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          สำหรับผู้พัฒนาระบบอื่นที่จะถามตารางวิชาเสริมของแต่ละวัน แล้วส่งผลเช็คชื่อกลับมาบันทึกในระบบนี้
        </p>
        <p className="mt-3 text-sm">
          ที่อยู่ API: <Inline>{base}</Inline>
        </p>
      </header>

      <Card>
        <CardHeader icon={<Workflow className="size-4.5" strokeWidth={1.8} />} title="ขั้นตอนโดยรวม" />
        <ol className="list-decimal space-y-2 px-4 pb-5 pl-9 text-sm sm:px-5 sm:pl-10">
          <li>
            ขอ <b>กุญแจ API</b> จากผู้ดูแลระบบวิชาเสริม (เมนู ดูแลระบบ → กุญแจ API)
          </li>
          <li>
            เรียก <Inline>GET /schedule</Inline> ดูว่าวันนี้มีวิชาเสริมหรือไม่ (<Inline>hasClasses</Inline>)
            และมีนักเรียนคนไหนต้องเช็คชื่อบ้าง
          </li>
          <li>ระบบของคุณเช็คชื่อตามวิธีของตัวเอง (สแกนหน้า บัตร QR ฯลฯ)</li>
          <li>
            ส่งผลกลับด้วย <Inline>POST /attendance</Inline> แยกช่วงเช้า / บ่าย — ผลจะขึ้นในหน้าเช็คชื่อของครูทันที
          </li>
        </ol>
      </Card>

      <Card>
        <CardHeader icon={<KeyRound className="size-4.5" strokeWidth={1.8} />} title="การยืนยันตัวตน" />
        <div className="space-y-3 px-4 pb-5 text-sm sm:px-5">
          <p>
            ส่งกุญแจใน header <Inline>X-API-Key</Inline> ทุกคำขอ กุญแจขึ้นต้นด้วย <Inline>trk_</Inline>
          </p>
          <Code>{`X-API-Key: trk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>เรียกจาก <b>เซิร์ฟเวอร์</b> เท่านั้น — อย่าใส่กุญแจในหน้าเว็บหรือแอปที่ผู้ใช้เปิดดูโค้ดได้</li>
            <li>กุญแจที่ถูกยกเลิกจะได้ <Inline>401</Inline> ทันที ให้ขอกุญแจใหม่จากผู้ดูแล</li>
            <li>เรียกได้ไม่เกิน 300 ครั้ง/นาที ต่อกุญแจ — เกินจะได้ <Inline>429</Inline> พร้อม header <Inline>Retry-After</Inline> (วินาที)</li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<CalendarSearch className="size-4.5" strokeWidth={1.8} />}
          title={
            <>
              <Method>GET</Method> /schedule — วันนี้มีวิชาเสริมหรือไม่
            </>
          }
        />
        <div className="space-y-4 px-4 pb-5 text-sm sm:px-5">
          <Fields
            rows={[
              ['date', 'ไม่บังคับ', 'YYYY-MM-DD (ค.ศ.) — ไม่ส่ง = วันนี้ตามเวลาไทย'],
            ]}
            label="Query"
          />
          <Code>{`curl -H "X-API-Key: trk_…" "${base}/schedule?date=2026-10-24"`}</Code>
          <p className="font-medium">ตัวอย่างผลลัพธ์</p>
          <Code>{`{
  "date": "2026-10-24",
  "year": "2569",
  "hasClasses": true,
  "sections": [
    {
      "sectionId": 12,
      "name": "ม.4-1",
      "room": "อาคาร 3 ห้อง 312",
      "subject": { "code": "ET101", "name": "Robotics" },
      "group":   { "code": "ET",    "name": "Engineering & Technology" },
      "teacherName": "อ.สมชาย",
      "studentCount": 35,
      "checked": { "morning": false, "afternoon": false },
      "students": [
        {
          "studentId": 501,
          "code": "12345",
          "fullName": "ด.ช.ตัวอย่าง ใจดี",
          "gradeLevel": "ม.4",
          "classroom": "1",
          "classNumber": 7,
          "morning": null,
          "afternoon": null
        }
      ]
    }
  ]
}`}</Code>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <Inline>hasClasses: false</Inline> และ <Inline>sections: []</Inline> = วันนั้นไม่มีวิชาเสริม
            </li>
            <li>
              <Inline>code</Inline> คือรหัสนักเรียน — ใช้ตัวนี้ตอนส่งผลกลับ
            </li>
            <li>
              <Inline>morning</Inline> / <Inline>afternoon</Inline>: <Inline>true</Inline> มา ·{' '}
              <Inline>false</Inline> ไม่มา · <Inline>null</Inline> ยังไม่เช็ค
            </li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<ClipboardCheck className="size-4.5" strokeWidth={1.8} />}
          title={
            <>
              <Method>POST</Method> /attendance — ส่งผลเช็คชื่อ
            </>
          }
        />
        <div className="space-y-4 px-4 pb-5 text-sm sm:px-5">
          <Fields
            label="Body (JSON)"
            rows={[
              ['slot', 'บังคับ', '"morning" (เช้า) หรือ "afternoon" (บ่าย)'],
              ['records', 'บังคับ', 'รายการนักเรียน 1–2000 คน'],
              ['records[].studentCode', 'บังคับ*', 'รหัสนักเรียน (* หรือส่ง studentId แทน)'],
              ['records[].present', 'บังคับ', 'true = มา · false = ไม่มา'],
              ['date', 'ไม่บังคับ', 'YYYY-MM-DD — ไม่ส่ง = วันนี้'],
              ['sectionId', 'ไม่บังคับ', 'ส่งเฉพาะเมื่อนักเรียนมีมากกว่า 1 กลุ่มเรียนในวันเดียว'],
            ]}
          />
          <Code>{`curl -X POST "${base}/attendance" \\
  -H "X-API-Key: trk_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "date": "2026-10-24",
    "slot": "morning",
    "records": [
      { "studentCode": "12345", "present": true },
      { "studentCode": "12346", "present": false }
    ]
  }'`}</Code>
          <p className="font-medium">ตัวอย่างผลลัพธ์</p>
          <Code>{`{
  "date": "2026-10-24",
  "slot": "morning",
  "saved": 1,
  "sections": [{ "sectionId": 12, "saved": 1 }],
  "rejected": [
    {
      "studentCode": "12346",
      "studentId": null,
      "reason": "not_enrolled",
      "message": "นักเรียนคนนี้ไม่มีวิชาเสริมที่เรียนในวันนี้"
    }
  ]
}`}</Code>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>ไม่ต้องรู้ว่านักเรียนอยู่กลุ่มไหน — ระบบหากลุ่มเรียนของนักเรียนในวันนั้นให้เอง</li>
            <li>
              บันทึก<b>เฉพาะคนที่ส่งมา</b> คนที่ไม่ได้ส่งยังเป็น “ยังไม่เช็ค” — ทยอยส่งหลายครั้งได้
            </li>
            <li>ส่งคนเดิมซ้ำ = แก้ผลเดิม (รวมถึงผลที่ครูเช็คไว้) · ในคำขอเดียวส่งซ้ำ ใช้รายการหลังสุด</li>
            <li>
              คนที่บันทึกไม่ได้อยู่ใน <Inline>rejected</Inline> ส่วนคนอื่นบันทึกตามปกติ — ตรวจ{' '}
              <Inline>rejected</Inline> ทุกครั้ง แม้ได้ <Inline>200</Inline>
            </li>
          </ul>
          <Fields
            label="เหตุผลใน rejected"
            rows={[
              ['unknown_student', '', 'ไม่พบรหัสนักเรียนนี้ในระบบวิชาเสริม (ม.4-6)'],
              ['not_enrolled', '', 'มีนักเรียนคนนี้ แต่วันนั้นไม่มีวิชาเสริมที่ต้องเรียน'],
              ['ambiguous_section', '', 'มีมากกว่า 1 กลุ่มในวันนั้น — ส่งใหม่พร้อม sectionId จาก /schedule'],
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<TriangleAlert className="size-4.5" strokeWidth={1.8} />} title="รหัสข้อผิดพลาด" />
        <div className="space-y-3 px-4 pb-5 text-sm sm:px-5">
          <p className="text-muted-foreground">
            ทุก error มีรูปแบบเดียวกัน — ใช้ <Inline>error</Inline> ในโค้ด และแสดง <Inline>message</Inline> ให้ผู้ใช้
          </p>
          <Code>{`{ "error": "unauthorized", "message": "ไม่มีกุญแจ API หรือกุญแจถูกยกเลิกแล้ว — ส่งใน header X-API-Key" }`}</Code>
          <Fields
            label="HTTP"
            rows={[
              ['400 bad_request', '', 'body ไม่ถูกรูปแบบ (ขาด slot / records)'],
              ['400 bad_date', '', 'วันที่ไม่ใช่ YYYY-MM-DD'],
              ['401 unauthorized', '', 'ไม่มีกุญแจ / กุญแจผิด / ถูกยกเลิก'],
              ['422 not_scheduled', '', 'sectionId ที่ส่งมาไม่ได้เรียนในวันนั้น'],
              ['429 rate_limited', '', 'เรียกถี่เกินไป — รอตาม Retry-After'],
              ['503 no_active_year', '', 'ระบบยังไม่ได้ตั้งปีการศึกษา — แจ้งผู้ดูแล'],
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Workflow className="size-4.5" strokeWidth={1.8} />} title="ตัวอย่างโค้ด (JavaScript)" />
        <div className="px-4 pb-5 sm:px-5">
          <Code>{`const BASE = '${base}';
const KEY = process.env.TRACKS_API_KEY; // เก็บไว้ฝั่งเซิร์ฟเวอร์

// 1. วันนี้มีวิชาเสริมไหม
const day = await fetch(\`\${BASE}/schedule\`, {
  headers: { 'X-API-Key': KEY },
}).then((r) => r.json());

if (!day.hasClasses) return; // วันนี้ไม่มี

// 2. ... เช็คชื่อที่ระบบของคุณ ...

// 3. ส่งผลกลับ
const res = await fetch(\`\${BASE}/attendance\`, {
  method: 'POST',
  headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slot: 'morning',
    records: [{ studentCode: '12345', present: true }],
  }),
}).then((r) => r.json());

if (res.rejected?.length) console.warn('บันทึกไม่ได้', res.rejected);`}</Code>
        </div>
      </Card>
    </main>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary px-1 py-0.5 text-[0.85em]">{children}</code>;
}

function Method({ children }: { children: string }) {
  return (
    <span className="mr-1 rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
      {children}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Fields({ label, rows }: { label: string; rows: [string, string, string][] }) {
  return (
    <div>
      <p className="mb-1.5 font-medium">{label}</p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-border/60">
            {rows.map(([name, need, what]) => (
              <tr key={name}>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{name}</td>
                {need ? <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{need}</td> : null}
                <td className="px-3 py-2">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
