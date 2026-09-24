'use client';

import { useRef, useState } from 'react';
import { BadgeCheck, Contrast, FileSignature, ImageUp, Landmark, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Input, Label } from '@/components/ui';
import { saveDocumentSettings, type SettingsForm } from './actions';

/**
 * Longest side an uploaded image is scaled down to before it is stored. The
 * crest prints at 46pt and a signature at 36pt — about 60 and 50 device pixels
 * — so anything past a few hundred pixels is bytes carried into every page of
 * every transcript for nothing.
 */
const MAX_DIM = { logo: 512, signature: 640 } as const;

/**
 * File → data URL, re-encoded as PNG and scaled to fit MAX_DIM. Doing this in
 * the browser means the admin can hand the form a 4 MB phone photo of a
 * signature and the row still ends up a few tens of KB, with transparency
 * preserved for signatures cut out on a transparent background.
 */
async function toBoundedPng(file: File, maxDim: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

/**
 * Flatten an already-stored image to greys, in place, without a re-upload.
 *
 * The transcript itself is printed entirely in black and white, so a colour
 * crest is the one thing on the sheet that a mono printer has to guess at.
 * This converts what is already saved rather than forcing greyscale on upload:
 * the picture is the school's, and turning it grey is their call, not ours.
 *
 * Rec. 601 luma is used because it is what the printer's own colour-to-grey
 * conversion approximates, so the preview matches the paper.
 */
async function toGrayscale(dataUrl: string): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    // Alpha is left alone so a cut-out signature stays cut out.
    d[i] = d[i + 1] = d[i + 2] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function ImageField({
  label,
  hint,
  value,
  onChange,
  maxDim,
  /** signatures read as ink on paper; the crest is shown on a plain tile */
  wide,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  maxDim: number;
  wide?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await toBoundedPng(file, maxDim));
    } catch {
      toast.error('อ่านไฟล์รูปไม่ได้ — ลองไฟล์ PNG หรือ JPG');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function desaturate() {
    setBusy(true);
    try {
      onChange(await toGrayscale(value));
      toast.success('แปลงเป็นขาว-ดำแล้ว — กด “บันทึกตั้งค่า” เพื่อยืนยัน');
    } catch {
      toast.error('แปลงรูปไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-secondary/30 ${
            wide ? 'h-20 w-40' : 'size-20'
          }`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageUp className="size-6 text-muted-foreground" strokeWidth={1.6} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImageUp className="size-4" strokeWidth={1.8} />
              {value ? 'เปลี่ยนรูป' : 'เลือกรูป'}
            </Button>
            {value ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={desaturate}
                  title="แปลงรูปที่บันทึกไว้ให้เป็นโทนขาว-ดำ ให้เข้ากับตัวเอกสาร"
                >
                  <Contrast className="size-4" strokeWidth={1.8} />
                  แปลงเป็นขาว-ดำ
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                  <Trash2 className="size-4" strokeWidth={1.8} />
                  ลบรูป
                </Button>
              </>
            ) : null}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}

export function SettingsManager({ initial }: { initial: SettingsForm }) {
  const [form, setForm] = useState<SettingsForm>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveDocumentSettings(form);
    setSaving(false);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl">
        <CardHeader
          icon={<Landmark className="size-4.5" strokeWidth={1.8} />}
          title="หัวกระดาษ"
        />
        <div className="space-y-4 px-4 pb-5 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-school">ชื่อโรงเรียน</Label>
              <Input
                id="s-school"
                value={form.schoolName}
                onChange={(e) => set('schoolName', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="s-title">ชื่อเอกสาร</Label>
              <Input
                id="s-title"
                value={form.documentTitle}
                onChange={(e) => set('documentTitle', e.target.value)}
                placeholder="เช่น ผลการเรียนวิชาเสริม"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="s-subtitle">คำอธิบายใต้ชื่อเอกสาร (ไม่บังคับ)</Label>
            <Input
              id="s-subtitle"
              value={form.documentSubtitle ?? ''}
              onChange={(e) => set('documentSubtitle', e.target.value)}
              placeholder="เช่น ระเบียนสะสมผลการเรียนวิชาเสริม ระดับชั้น ม.4 - ม.6"
            />
          </div>
          <ImageField
            label="ตราโรงเรียน"
            hint="แสดงมุมซ้ายบนของทรานสคริปต์ · PNG พื้นหลังโปร่งใสจะสวยที่สุด — ตัวเอกสารพิมพ์ขาว-ดำทั้งฉบับ ถ้าอยากให้ตราเข้ากัน กด “แปลงเป็นขาว-ดำ” ได้เลย"
            value={form.logo ?? ''}
            onChange={(v) => set('logo', v)}
            maxDim={MAX_DIM.logo}
          />
        </div>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader
          icon={<FileSignature className="size-4.5" strokeWidth={1.8} />}
          title="ผู้ลงนามในเอกสาร"
          action={<span className="text-xs text-muted-foreground">พิมพ์คู่กันท้ายหน้า</span>}
        />
        <div className="divide-y divide-border/60">
          <SignerFields
            idPrefix="reg"
            heading="นายทะเบียนวัดผล (ลงนามช่องซ้าย)"
            name={form.registrarName ?? ''}
            title={form.registrarTitle}
            signature={form.registrarSignature ?? ''}
            onName={(v) => set('registrarName', v)}
            onTitle={(v) => set('registrarTitle', v)}
            onSignature={(v) => set('registrarSignature', v)}
          />
          <SignerFields
            idPrefix="dir"
            heading="ผู้อำนวยการ (ลงนามช่องขวา)"
            name={form.directorName ?? ''}
            title={form.directorTitle}
            signature={form.directorSignature ?? ''}
            onName={(v) => set('directorName', v)}
            onTitle={(v) => set('directorTitle', v)}
            onSignature={(v) => set('directorSignature', v)}
          />
        </div>
      </Card>

      <div className="flex max-w-3xl flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={saving}>
          <Save className="size-4.5" strokeWidth={1.8} />
          {saving ? 'กำลังบันทึก…' : 'บันทึกตั้งค่า'}
        </Button>
        <a href="/admin/transcript" className="text-sm text-primary hover:underline">
          ไปหน้าทรานสคริปต์เพื่อลองพิมพ์
        </a>
      </div>
    </div>
  );
}

function SignerFields({
  idPrefix,
  heading,
  name,
  title,
  signature,
  onName,
  onTitle,
  onSignature,
}: {
  idPrefix: string;
  heading: string;
  name: string;
  title: string;
  signature: string;
  onName: (v: string) => void;
  onTitle: (v: string) => void;
  onSignature: (v: string) => void;
}) {
  return (
    <div className="space-y-4 px-4 py-5 sm:px-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BadgeCheck className="size-4 text-primary" strokeWidth={1.8} />
        {heading}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-name`}>ชื่อ - สกุล</Label>
          <Input
            id={`${idPrefix}-name`}
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="เช่น นายสมชาย ใจดี"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-title`}>ตำแหน่ง</Label>
          <Input
            id={`${idPrefix}-title`}
            value={title}
            onChange={(e) => onTitle(e.target.value)}
          />
        </div>
      </div>
      <ImageField
        label="ลายเซ็น (ไม่บังคับ)"
        hint="เว้นว่างไว้ได้ถ้าต้องการเซ็นสดบนกระดาษ — ระบบจะเว้นที่ให้เซ็นเสมอ"
        value={signature}
        onChange={onSignature}
        maxDim={MAX_DIM.signature}
        wide
      />
    </div>
  );
}
