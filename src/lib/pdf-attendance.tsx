import 'server-only';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { base, thai, PURPLE, LINE, MUTED } from './pdf-base';
import { thaiDateTimeLongOf, THAI_WEEKDAYS } from './utils';

export interface AttendanceSheetData {
  yearLabel: string;
  groupCode: string;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  meetingDays: number[];
  students: {
    no: number;
    code: string;
    fullName: string;
    gradeLevel: string | null;
    classroom: string | null;
  }[];
  /** number of blank marking columns to print */
  columns: number;
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: 700, color: PURPLE },
  sub: { color: MUTED, fontSize: 9, marginTop: 2 },
  rule: { height: 2, width: 40, backgroundColor: '#f5c518', marginVertical: 8 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  meta: { fontSize: 9, color: MUTED },
  metaVal: { fontSize: 10, color: '#1a1625', fontWeight: 600 },

  table: { borderTopWidth: 1, borderColor: LINE },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, minHeight: 20, alignItems: 'center' },
  th: { backgroundColor: '#f1edf7', fontWeight: 600, fontSize: 9 },
  cNo: { width: 26, textAlign: 'center', fontSize: 9 },
  cCode: { width: 52, fontSize: 9, paddingLeft: 4 },
  cName: { flex: 1, fontSize: 9, paddingLeft: 4 },
  cRoom: { width: 40, textAlign: 'center', fontSize: 8, color: MUTED },
  mark: { width: 20, textAlign: 'center', borderLeftWidth: 1, borderColor: LINE, height: '100%' },
});

export function AttendanceSheet({ data }: { data: AttendanceSheetData }) {
  const cols = Array.from({ length: Math.max(1, data.columns) });
  const days = data.meetingDays.map((d) => THAI_WEEKDAYS[d]).filter(Boolean).join(', ');

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={base.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>ใบเช็คชื่อวิชาเสริม</Text>
            <Text style={s.sub}>โรงเรียนสุคนธีรวิทย์ · {thai(data.yearLabel)}</Text>
          </View>
          <Text style={s.sub}>รวม {data.students.length} คน</Text>
        </View>
        <View style={s.rule} />

        <View style={s.metaRow}>
          <Text style={s.meta}>วิชา: <Text style={s.metaVal}>{thai(`${data.groupCode} · ${data.subjectCode} — ${data.subjectName}`)}</Text></Text>
          {data.teacherName ? <Text style={s.meta}>ครูผู้สอน: <Text style={s.metaVal}>{thai(data.teacherName)}</Text></Text> : null}
          {days ? <Text style={s.meta}>วันเรียน: <Text style={s.metaVal}>{thai(days)}</Text></Text> : null}
        </View>

        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            <Text style={s.cNo}>ที่</Text>
            <Text style={s.cCode}>รหัส</Text>
            <Text style={s.cName}>ชื่อ - สกุล</Text>
            <Text style={s.cRoom}>ชั้น</Text>
            {cols.map((_, i) => (
              <Text key={i} style={s.mark}>{i + 1}</Text>
            ))}
          </View>
          {data.students.map((st) => (
            <View key={st.code} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{st.no}</Text>
              <Text style={s.cCode}>{st.code}</Text>
              <Text style={s.cName}>{thai(st.fullName)}</Text>
              <Text style={s.cRoom}>{st.gradeLevel ?? ''}/{st.classroom ?? ''}</Text>
              {cols.map((_, i) => (
                <Text key={i} style={s.mark}> </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={base.footer} fixed>
          <Text>Track · ระบบวิชาเสริม</Text>
          <Text>พิมพ์เมื่อ {thaiDateTimeLongOf(new Date())}</Text>
        </View>
      </Page>
    </Document>
  );
}
