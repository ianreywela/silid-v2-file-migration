import { getDb } from "@/lib/firebase/admin";

export type SchoolSummary = {
  schoolCode: string;
  schoolYear?: string;
  schoolName?: string;
};

export async function getSchoolsByDateRange(
  startDate: Date,
  endDate: Date,
): Promise<SchoolSummary[]> {
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  const snapshot = await getDb()
    .collection("classData")
    .where("creation", ">=", startTs)
    .where("creation", "<=", endTs)
    .get();

  const schoolsMap = new Map<string, SchoolSummary>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const schoolCode = data.schoolCode as string | undefined;
    const schoolYear = data.schoolYear as string | undefined;
    if (!schoolCode) continue;

    if (!schoolsMap.has(schoolCode)) {
      schoolsMap.set(schoolCode, { schoolCode, schoolYear });
    }
  }

  const schools = Array.from(schoolsMap.values());

  await Promise.all(
    schools.map(async (school) => {
      school.schoolName = await getSchoolName(school.schoolCode);
    }),
  );

  return schools.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode));
}

export async function getSchoolName(schoolCode: string): Promise<string> {
  const snap = await getDb().collection("schoolConfig").doc(schoolCode).get();
  if (snap.exists) {
    const schoolName = snap.data()?.schoolName;
    if (schoolName) return String(schoolName).trim();
  }
  return schoolCode;
}
