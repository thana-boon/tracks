'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      toast.success(`ยินดีต้อนรับ ${data.name ?? ''}`.trim());
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : data.redirect ?? '/');
      router.refresh();
    } catch {
      toast.error('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="username">ชื่อผู้ใช้ / รหัสประจำตัว</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ผู้ดูแล · รหัสครู · รหัสนักเรียน"
          required
          autoFocus
        />
      </div>

      <div>
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-11"
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4.5" strokeWidth={1.7} /> : <Eye className="size-4.5" strokeWidth={1.7} />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4.5 animate-spin" />
        ) : (
          <LogIn className="size-4.5" strokeWidth={1.8} />
        )}
        เข้าสู่ระบบ
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ระบบจะตรวจสอบประเภทบัญชีให้อัตโนมัติ — ผู้ดูแล ครู หรือนักเรียน
        (ครู/นักเรียนตรวจสอบผ่าน SchoolOS · นักเรียนเฉพาะ ม.4-6 ที่ซิงก์แล้ว)
      </p>
    </form>
  );
}
