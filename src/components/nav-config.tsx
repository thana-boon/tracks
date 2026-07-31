import {
  LayoutDashboard,
  CalendarDays,
  RefreshCw,
  FolderKanban,
  BookOpen,
  School,
  ClipboardPen,
  ClipboardCheck,
  Eye,
  Printer,
  GraduationCap,
  FileText,
  DatabaseBackup,
  ScrollText,
  Users,
  ShieldCheck,
  CalendarCheck,
  Settings2,
  Stamp,
  Wrench,
} from 'lucide-react';
import type { AppRole } from '@/lib/session';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

/** A collapsible heading in the sidebar. Its `items` are the links underneath. */
export interface NavGroup {
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

/** Every link an entry stands for — a group's children, or the item itself. */
export function itemsOf(entry: NavEntry): NavItem[] {
  return isGroup(entry) ? entry.items : [entry];
}

const sw = 1.7;

/**
 * An admin has eighteen screens, which is a scroll rather than a menu when
 * laid out flat. They group cleanly by *when in the year they are used*: set the
 * year up, take attendance through it, read the results out, and the handful of
 * caretaker screens that are nobody's daily work. Only ภาพรวม stays loose at the
 * top, since that is where every session starts.
 *
 * Teachers and students have few enough screens that grouping would only add a
 * press, so their menus stay flat.
 */
export function navFor(role: AppRole): NavEntry[] {
  if (role === 'admin') {
    return [
      { href: '/admin', label: 'ภาพรวม', icon: <LayoutDashboard className="size-5" strokeWidth={sw} /> },
      {
        label: 'ตั้งค่าวิชาเสริม',
        icon: <Settings2 className="size-5" strokeWidth={sw} />,
        items: [
          { href: '/admin/years', label: 'ปีการศึกษา', icon: <CalendarDays className="size-5" strokeWidth={sw} /> },
          { href: '/admin/people', label: 'ซิงก์รายชื่อ', icon: <RefreshCw className="size-5" strokeWidth={sw} /> },
          { href: '/admin/groups', label: 'กลุ่มวิชา', icon: <FolderKanban className="size-5" strokeWidth={sw} /> },
          { href: '/admin/subjects', label: 'วิชาเสริม', icon: <BookOpen className="size-5" strokeWidth={sw} /> },
          { href: '/admin/classrooms', label: 'ห้องเรียนพิเศษ', icon: <School className="size-5" strokeWidth={sw} /> },
          { href: '/admin/register', label: 'จัดนักเรียนเข้าวิชา', icon: <ClipboardPen className="size-5" strokeWidth={sw} /> },
        ],
      },
      {
        label: 'งานเช็คชื่อ',
        icon: <ClipboardCheck className="size-5" strokeWidth={sw} />,
        items: [
          { href: '/attendance', label: 'เช็คชื่อ', icon: <ClipboardCheck className="size-5" strokeWidth={sw} /> },
          { href: '/attendance/view', label: 'ผลเช็คชื่อ', icon: <Eye className="size-5" strokeWidth={sw} /> },
          { href: '/attendance/print', label: 'พิมพ์ใบเช็คชื่อ', icon: <Printer className="size-5" strokeWidth={sw} /> },
        ],
      },
      {
        label: 'ผลและรายงาน',
        icon: <GraduationCap className="size-5" strokeWidth={sw} />,
        items: [
          { href: '/results', label: 'เวลาเข้าเรียน', icon: <CalendarCheck className="size-5" strokeWidth={sw} /> },
          { href: '/results/subject', label: 'ผลรายวิชา', icon: <GraduationCap className="size-5" strokeWidth={sw} /> },
          { href: '/homeroom', label: 'ห้องที่ปรึกษา', icon: <Users className="size-5" strokeWidth={sw} /> },
          { href: '/admin/transcript', label: 'ทรานสคริปต์', icon: <FileText className="size-5" strokeWidth={sw} /> },
        ],
      },
      {
        label: 'ดูแลระบบ',
        icon: <Wrench className="size-5" strokeWidth={sw} />,
        items: [
          { href: '/admin/settings', label: 'ตั้งค่าเอกสาร', icon: <Stamp className="size-5" strokeWidth={sw} /> },
          { href: '/admin/permissions', label: 'สิทธิ์ผู้ดูแล', icon: <ShieldCheck className="size-5" strokeWidth={sw} /> },
          { href: '/admin/backup', label: 'สำรองข้อมูล', icon: <DatabaseBackup className="size-5" strokeWidth={sw} /> },
          { href: '/admin/logs', label: 'ประวัติการใช้งาน', icon: <ScrollText className="size-5" strokeWidth={sw} /> },
        ],
      },
    ];
  }
  if (role === 'teacher') {
    return [
      { href: '/teacher', label: 'ภาพรวม', icon: <LayoutDashboard className="size-5" strokeWidth={sw} /> },
      { href: '/attendance', label: 'เช็คชื่อ', icon: <ClipboardCheck className="size-5" strokeWidth={sw} /> },
      { href: '/results', label: 'เวลาเข้าเรียน', icon: <CalendarCheck className="size-5" strokeWidth={sw} /> },
      { href: '/results/subject', label: 'ผลรายวิชา', icon: <GraduationCap className="size-5" strokeWidth={sw} /> },
      { href: '/homeroom', label: 'ห้องที่ปรึกษา', icon: <Users className="size-5" strokeWidth={sw} /> },
    ];
  }
  // student
  return [
    { href: '/student', label: 'วิชาเสริมของฉัน', icon: <LayoutDashboard className="size-5" strokeWidth={sw} /> },
  ];
}

export const roleLabel: Record<AppRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  teacher: 'ครู',
  student: 'นักเรียน',
};
