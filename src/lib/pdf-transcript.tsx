import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { base, thai, PURPLE, GOLD, LINE, MUTED } from './pdf-base';
import { thaiDateTimeLongOf } from './utils';
import { OVERALL_LABEL } from './evaluate';
import type { StudentTranscript } from './transcript';

const s = StyleSheet.create({
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  school: { fontSize: 10, color: MUTED },
  title: { fontSize: 16, fontWeight: 700, color: PURPLE, marginTop: 2 },
  rule: { height: 2, width: 44, backgroundColor: GOLD, marginVertical: 10 },

  info: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  infoItem: { width: '50%', flexDirection: 'row', marginBottom: 3 },
  infoLabel: { width: 70, fontSize: 9, color: MUTED },
  infoVal: { fontSize: 10, fontWeight: 600 },

  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, minHeight: 22, alignItems: 'center' },
  trLast: { borderBottomWidth: 0 },
  th: { backgroundColor: '#f1edf7', fontWeight: 600 },
  cNo: { width: 26, textAlign: 'center', fontSize: 9 },
  cGroup: { width: 44, textAlign: 'center', fontSize: 9 },
  cCode: { width: 60, fontSize: 9, paddingLeft: 4 },
  cName: { flex: 1, fontSize: 9, paddingLeft: 4 },
  cDays: { width: 60, textAlign: 'center', fontSize: 9 },
  cResult: { width: 70, textAlign: 'center', fontSize: 9, fontWeight: 600 },

  empty: { padding: 16, textAlign: 'center', color: MUTED, fontSize: 10 },
  sign: { marginTop: 40, flexDirection: 'row', justifyContent: 'flex-end' },
  signBox: { width: 200, alignItems: 'center' },
  signLine: { borderTopWidth: 1, borderColor: '#1a1625', width: '100%', marginBottom: 4 },
  signText: { fontSize: 9, color: MUTED },
});

const resultColor: Record<string, string> = {
  excellent: '#8a6a00',
  pass: '#16a34a',
  fail: '#dc2626',
  pending: '#6b6478',
};

function StudentPage({ t, yearLabel }: { t: StudentTranscript; yearLabel: string }) {
  const { student, lines } = t;
  return (
    <Page size="A4" style={base.page}>
      <View style={s.band}>
        <View>
          <Text style={s.school}>โรงเรียนสุคนธีรวิทย์</Text>
          <Text style={s.title}>ใบแสดงผลวิชาเสริม</Text>
        </View>
        <Text style={s.school}>{thai(yearLabel)}</Text>
      </View>
      <View style={s.rule} />

      <View style={s.info}>
        <View style={s.infoItem}>
          <Text style={s.infoLabel}>ชื่อ - สกุล</Text>
          <Text style={s.infoVal}>{thai(student.fullName)}</Text>
        </View>
        <View style={s.infoItem}>
          <Text style={s.infoLabel}>รหัสนักเรียน</Text>
          <Text style={s.infoVal}>{student.code}</Text>
        </View>
        <View style={s.infoItem}>
          <Text style={s.infoLabel}>ระดับชั้น</Text>
          <Text style={s.infoVal}>{thai(`${student.gradeLevel ?? '-'}/${student.classroom ?? '-'}`)}</Text>
        </View>
        <View style={s.infoItem}>
          <Text style={s.infoLabel}>เลขที่</Text>
          <Text style={s.infoVal}>{student.classNumber ?? '-'}</Text>
        </View>
      </View>

      <View style={s.table}>
        <View style={[s.tr, s.th]}>
          <Text style={s.cNo}>ที่</Text>
          <Text style={s.cGroup}>กลุ่ม</Text>
          <Text style={s.cCode}>รหัสวิชา</Text>
          <Text style={s.cName}>ชื่อวิชา</Text>
          <Text style={s.cDays}>วันเรียน</Text>
          <Text style={s.cResult}>ผลการเรียน</Text>
        </View>
        {lines.length === 0 ? (
          <Text style={s.empty}>ยังไม่ได้ลงทะเบียนวิชาเสริมในปีนี้</Text>
        ) : (
          lines.map((l, i) => (
            <View key={`${l.subjectCode}-${i}`} style={[s.tr, i === lines.length - 1 ? s.trLast : {}]}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cGroup}>{l.groupCode}</Text>
              <Text style={s.cCode}>{l.subjectCode}</Text>
              <Text style={s.cName}>{thai(l.subjectName)}</Text>
              <Text style={s.cDays}>{l.totalDays} วัน</Text>
              <Text style={[s.cResult, { color: resultColor[l.overall] }]}>{OVERALL_LABEL[l.overall]}</Text>
            </View>
          ))
        )}
      </View>

      <View style={s.sign}>
        <View style={s.signBox}>
          <View style={s.signLine} />
          <Text style={s.signText}>ลงชื่อผู้รับรอง</Text>
        </View>
      </View>

      <View style={base.footer} fixed>
        <Text>Track · ระบบวิชาเสริม โรงเรียนสุคนธีรวิทย์</Text>
        <Text>ออกเอกสารเมื่อ {thaiDateTimeLongOf(new Date())}</Text>
      </View>
    </Page>
  );
}

export function TranscriptDocument({
  transcripts,
  yearLabel,
}: {
  transcripts: StudentTranscript[];
  yearLabel: string;
}) {
  return (
    <Document>
      {transcripts.map((t) => (
        <StudentPage key={t.student.id} t={t} yearLabel={yearLabel} />
      ))}
    </Document>
  );
}
