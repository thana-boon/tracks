# Track — ระบบวิชาเสริม (ม.4-6)

ส่วนหนึ่งของ **SchoolOS** โรงเรียนสุคนธีรวิทย์ · จัดกลุ่มวิชาเสริม จัดนักเรียนเข้าเรียน
เช็คชื่อ และประเมินผลอัตโนมัติจากการเข้าเรียน · เชื่อมข้อมูลนักเรียน/ครูจาก **Users Service API**

- **Stack:** Next.js (App Router) + TypeScript · Drizzle ORM + PostgreSQL · Tailwind v4 + shadcn-style UI · @react-pdf/renderer
- **พอร์ต:** `3004` (host) → 3000 (container)
- **ฐานข้อมูล:** ใช้ database `tracks` ใน `postgres-core` ที่มีอยู่แล้ว — **สแตกนี้ไม่สร้าง postgres ใหม่**

---

## 1. สถาปัตยกรรม

| ส่วน | รายละเอียด |
|---|---|
| Identity | ไม่มี user/login ของตัวเอง — ยืนยันตัวตนผ่าน `POST /api/public/v1/auth/verify` ของ Users Service |
| Role | มาจาก API: ครูที่เป็น `teacher-admin` → เข้าเป็น **admin**, `teacher` → **teacher**, นักเรียน → **student** |
| ข้อมูลนักเรียน/ครู | ซิงก์ทางเดียวจาก Users Service (นักเรียนเฉพาะ ม.4-6) — อ่านอย่างเดียว |
| ผลการเรียน | คำนวณอัตโนมัติจากการเช็คชื่อ — ไม่ให้กรอกเกรดตรง ๆ (ดู `src/lib/evaluate.ts`) |
| Local admin | มี admin ท้องถิ่นสำรอง 1 บัญชี (bootstrap ตอนบูตครั้งแรก) เผื่อ API ล่ม |

### สิทธิ์ (Roles)
- **Admin** — จัดการทุกอย่าง: กลุ่มวิชา/วิชา, ห้องเรียนพิเศษ, จัดนักเรียนเข้าวิชา, เช็คชื่อ, ผลการเรียน, ทรานสคริปต์, สำรอง/กู้คืน, ประวัติการใช้งาน
- **Teacher** — เช็คชื่อได้ทุกวิชา (ไม่ผูกว่าเป็นผู้สอน), ดูผล, และดูผลวิชาเสริมของนักเรียนในห้องที่ปรึกษาของตน
- **Student** — ดูวิชาเสริมและผลของตนเอง (อ่านอย่างเดียว)

> การจัดนักเรียนเข้าวิชา (register_track) เป็นสิทธิ์ **admin เท่านั้น** — ไม่ใช่ self-service

---

## 2. การประเมินผล (หัวใจของระบบ)

`src/lib/evaluate.ts` เป็น **pure function** ทดสอบแยกจาก UI ได้ (`npm test` — 9 เคส):

| การเข้าเรียน (ตามวันที่วิชากำหนด) | ผล |
|---|---|
| มาครบทุกคาบที่มีการเช็ค ทุกวัน | **ยอดเยี่ยม** |
| เข้าเรียน ≥ 60% ของวันที่มีคาบ (นับครึ่งวันด้วย) | **ผ่าน** |
| ต่ำกว่านั้น | **ไม่ผ่าน** |
| ยังไม่มีวันที่เช็คชื่อ | **รอประเมิน** |

- แต่ละวันมี 2 คาบ: **เช้า / บ่าย** — คาบที่ครูไม่เคยเช็ค = ไม่นับ (ไม่เสียคะแนน)
- วิชากำหนด "วันเรียน" (วันในสัปดาห์) ได้ — วันที่เช็คนอกวันเรียนจะถูกกรองทิ้ง

---

## 3. รันบนเครื่อง dev (ไม่ใช้ docker)

ต้องมี `postgres-core` รันอยู่และ publish 5432 บน host

```bash
cp .env.example .env      # แก้ค่าให้ถูก (โดยเฉพาะ SCHOOLOS_API_KEY)
npm install
npm run db:migrate        # สร้างตารางใน database tracks
npm run dev               # http://localhost:3004
npm test                  # รันชุดทดสอบ evaluate
```

---

## 4. Deploy ด้วย Docker (production / Portainer)

**สแตกนี้ไม่สร้าง postgres** — ต่อเข้ากับ `postgres-core` ผ่าน network `school-net` (external)

```bash
cp .env.example .env      # ใส่ค่า secret จริงทั้งหมด (ห้าม commit)
docker compose up -d --build
```

ลำดับตอน `up`: `migrate` (ใส่ schema แล้วจบ) → `app` — ไม่มี prompt, ไม่มี seed step
ที่ต้องรันมือ (admin แรกถูกสร้างอัตโนมัติตอนบูตจาก `SEED_ADMIN_*` เมื่อยังไม่มี admin)

- **ทุก secret อยู่ใน `.env` เท่านั้น** — compose ใช้ `env_file`/`${VAR}` ไม่มี hardcode
- ถ้าลืมรหัส admin: `docker compose run --rm migrate npx tsx scripts/seed-admin.ts`
- nginx: ดู `deploy/nginx-track.conf` (path `/track` หรือ subdomain) — พอร์ตแอป **3004**

### ตัวแปรใน `.env`

| ตัวแปร | ความหมาย |
|---|---|
| `APP_PORT` | พอร์ต host (3004) |
| `DATABASE_URL_INTERNAL` | ต่อ `postgres-core` ผ่าน school-net (ใช้ในคอนเทนเนอร์) |
| `DATABASE_URL` | ต่อผ่าน localhost:5432 (ใช้ตอน `npm run dev` / migrate นอก docker) |
| `JWT_SECRET` | ลายเซ็น session ของแอปนี้ (ไม่เกี่ยวกับ SchoolOS) |
| `SCHOOLOS_API_BASE_URL` | เช่น `http://192.168.200.56:3002` หรือ `http://postgres-core-net-host:3002` |
| `SCHOOLOS_API_KEY` | API key `sk_live_...` — scope ที่ต้องมี: `students:read`, `teachers:read`, `auth:students`, `auth:teachers` (และ `years:read` ถ้ามี) |
| `BACKUP_DIR` | ที่เก็บไฟล์ pg_dump (docker: volume `tracks_backups`) |
| `SEED_ADMIN_*` | admin แรกตอนบูตครั้งแรก |

---

## 5. โครงสร้าง

```
src/
  app/
    login/                  หน้าเข้าสู่ระบบ (ตรวจผ่าน Users Service)
    admin/                  จัดการทั้งหมด (years, people, groups, subjects,
                            classrooms, register, transcript, backup, logs)
    attendance/             เช็คชื่อ + ผลเช็คชื่อ + พิมพ์ (admin + teacher)
    results/                ผลการเรียนรายวิชา (admin + teacher)
    teacher/                dashboard + ห้องที่ปรึกษา
    student/                วิชาเสริมของฉัน
    api/
      auth/                 login / logout
      attendance-sheet/     ใบเช็คชื่อ PDF
      transcript/           ทรานสคริปต์ PDF (1 หน้า/คน)
      backup/[name]/        ดาวน์โหลดไฟล์สำรอง
  lib/
    evaluate.ts             ★ ตรรกะประเมินผล (pure, มี test)
    schoolos.ts             client ของ Users Service API
    login.ts                resolve ตัวตน + role
    sync.ts                 ซิงก์ years/students/teachers/homerooms
    transcript.ts           ประกอบข้อมูลทรานสคริปต์
    backup.ts               pg_dump / pg_restore
  db/schema.ts              Drizzle schema (Postgres)
drizzle/                    migration SQL
deploy/nginx-track.conf     ตัวอย่าง reverse proxy
```

---

## 6. ขั้นตอนเริ่มใช้งานครั้งแรก (admin)

1. เข้าสู่ระบบด้วย admin (`SEED_ADMIN_USERNAME` / password ที่ตั้งไว้) หรือครู `teacher-admin`
2. **ปีการศึกษา** → ซิงก์จาก SchoolOS
3. **ซิงก์รายชื่อ** → ซิงก์นักเรียน, ครู, แล้วครูที่ปรึกษา (ตามลำดับ)
4. **กลุ่มวิชา** → เพิ่มกลุ่ม (เช่น ET) · **วิชาเสริม** → เพิ่มวิชาในกลุ่ม
5. **จัดนักเรียนเข้าวิชา** → เลือกวิชา ตั้งวันเรียน แล้วเลือกนักเรียน
6. **เช็คชื่อ** ทุกคาบเรียน → ระบบคำนวณ **ผลการเรียน** ให้อัตโนมัติ
7. **ทรานสคริปต์** → ออก PDF รายห้อง/รายวิชา
