import type { DocumentData, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase/admin";

const AWS_HOST_MARKER = "amazonaws.com";
const FIREBASE_STORAGE_MARKERS = [
  "firebasestorage.googleapis.com",
  "activityBank%2F",
  "activityBank/",
];

const HTML_AWS_SRC_RE = /src=["']([^"']*amazonaws\.com[^"']*)["']/gi;

export type CollectLogFn = (tag: string, message: string) => void;

export type CollectResult = {
  schoolCode: string;
  userCount: number;
  classCount: number;
  classIds: string[];
  folderPaths: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFirebaseStorageUrl(value: string): boolean {
  return FIREBASE_STORAGE_MARKERS.some((marker) => value.includes(marker));
}

function keyFromAwsUrl(url: string): string | null {
  if (!url || !url.includes(AWS_HOST_MARKER)) return null;
  if (isFirebaseStorageUrl(url)) return null;

  try {
    const afterHost = url.split(".com/", 2)[1];
    if (!afterHost) return null;
    const key = decodeURIComponent(afterHost.split("?", 1)[0]).replace(/^\/+/, "");
    return key || null;
  } catch {
    return null;
  }
}

function extractKeysFromValue(value: unknown, out: Set<string>, seen = new WeakSet<object>()): void {
  if (value == null) return;

  if (isPlainObject(value)) {
    if (seen.has(value)) return;
    seen.add(value);

    const folderName = value.folderName;
    if (typeof folderName === "string" && folderName.trim()) {
      const key = folderName.trim().replace(/^\/+/, "");
      if (key && !isFirebaseStorageUrl(key)) out.add(key);
    }

    for (const nested of Object.values(value)) {
      extractKeysFromValue(nested, out, seen);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) extractKeysFromValue(item, out, seen);
    return;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return;
    if (isFirebaseStorageUrl(text)) return;

    if (text.includes(AWS_HOST_MARKER)) {
      for (const match of text.matchAll(HTML_AWS_SRC_RE)) {
        const key = keyFromAwsUrl(match[1]);
        if (key) out.add(key);
      }
      const key = keyFromAwsUrl(text);
      if (key) out.add(key);
      return;
    }

    if (text.includes("/") && !text.startsWith("http") && text.split("/").pop()?.includes(".")) {
      out.add(text.replace(/^\/+/, ""));
    }
  }
}

function collectFromDoc(data: DocumentData | undefined, out: Set<string>): void {
  if (!data) return;
  extractKeysFromValue(data, out);
}

async function resolveClassIdsFromUsers(
  db: Firestore,
  schoolCode: string,
): Promise<{ users: DocumentSnapshot[]; classIds: Set<string> }> {
  const usersSnap = await db.collection("userData").where("schoolCode", "==", schoolCode).get();
  const users = usersSnap.docs;
  const classIds = new Set<string>();

  for (const userDoc of users) {
    const data = userDoc.data();
    const allClassIds = data.allClassIds;
    if (Array.isArray(allClassIds)) {
      for (const classId of allClassIds) {
        if (classId) classIds.add(String(classId));
      }
    }

    for (const sub of ["class", "deleted_class"] as const) {
      const subSnap = await userDoc.ref.collection(sub).get();
      for (const classDoc of subSnap.docs) {
        classIds.add(classDoc.id);
      }
    }
  }

  return { users, classIds };
}

async function collectKeysForClass(db: Firestore, classId: string, out: Set<string>): Promise<void> {
  const classSnap = await db.collection("classData").doc(classId).get();
  if (classSnap.exists) collectFromDoc(classSnap.data(), out);

  const activitiesRef = db
    .collection("activities")
    .doc(classId)
    .collection("activities");
  const activitiesSnap = await activitiesRef.get();

  for (const activityDoc of activitiesSnap.docs) {
    collectFromDoc(activityDoc.data(), out);

    const answersSnap = await activityDoc.ref.collection("answers").get();
    for (const answerDoc of answersSnap.docs) {
      collectFromDoc(answerDoc.data(), out);
      const attemptsSnap = await answerDoc.ref.collection("attempts").get();
      for (const attemptDoc of attemptsSnap.docs) {
        collectFromDoc(attemptDoc.data(), out);
      }
    }

    const evidenceSnap = await activityDoc.ref.collection("evidence").get();
    for (const evidenceDoc of evidenceSnap.docs) {
      collectFromDoc(evidenceDoc.data(), out);
    }
  }

  const postsSnap = await db.collection("discussions").doc(classId).collection("posts").get();
  for (const postDoc of postsSnap.docs) {
    collectFromDoc(postDoc.data(), out);
    const commentsSnap = await postDoc.ref.collection("comments").get();
    for (const commentDoc of commentsSnap.docs) {
      collectFromDoc(commentDoc.data(), out);
    }
  }

  const postsRequestSnap = await db
    .collection("discussions")
    .doc(classId)
    .collection("postsRequest")
    .get();
  for (const postDoc of postsRequestSnap.docs) {
    collectFromDoc(postDoc.data(), out);
  }
}

async function collectKeysForUser(db: Firestore, userDoc: DocumentSnapshot, out: Set<string>): Promise<void> {
  collectFromDoc(userDoc.data(), out);

  for (const sub of ["class", "deleted_class", "achievements", "CustomBadges"] as const) {
    const subSnap = await userDoc.ref.collection(sub).get();
    for (const subDoc of subSnap.docs) {
      collectFromDoc(subDoc.data(), out);
    }
  }

  const sectionSnap = await userDoc.ref.collection("section").get();
  for (const sectionDoc of sectionSnap.docs) {
    collectFromDoc(sectionDoc.data(), out);
    const classSnap = await sectionDoc.ref.collection("class").get();
    for (const classDoc of classSnap.docs) {
      collectFromDoc(classDoc.data(), out);
    }
  }

  const badgeClassSnap = await userDoc.ref.collection("badgeLogs").get();
  for (const badgeClassDoc of badgeClassSnap.docs) {
    const badgeLogsSnap = await badgeClassDoc.ref.collection("badgeLogs").get();
    for (const badgeLogDoc of badgeLogsSnap.docs) {
      collectFromDoc(badgeLogDoc.data(), out);
    }
  }
}

async function collectSchoolLevelKeys(
  db: Firestore,
  schoolCode: string,
  classIds: Set<string>,
  out: Set<string>,
): Promise<void> {
  const schoolSnap = await db.collection("schoolConfig").doc(schoolCode).get();
  if (schoolSnap.exists) collectFromDoc(schoolSnap.data(), out);

  for (const collectionName of [
    "activityBank",
    "activityBankArchives",
    "questionBank",
    "questionBankArchives",
    "scheduledActivity",
  ]) {
    const snap = await db.collection(collectionName).where("schoolCode", "==", schoolCode).get();
    for (const doc of snap.docs) {
      collectFromDoc(doc.data(), out);
    }
  }

  const schedulerSnap = await db.collection("discussionsScheduler").get();
  for (const doc of schedulerSnap.docs) {
    const data = doc.data();
    if (classIds.has(String(data.classId))) {
      collectFromDoc(data, out);
    }
  }
}

export async function collectFolderPathsBySchool(
  schoolCode: string,
  log?: CollectLogFn,
): Promise<CollectResult> {
  const db = getDb();
  const writeLog = (tag: string, message: string) => {
    if (log) log(tag, message);
    else console.log(`[${tag}] ${message}`);
  };

  const { users, classIds } = await resolveClassIdsFromUsers(db, schoolCode);
  const keys = new Set<string>();

  writeLog("COLLECT", `users=${users.length} classes=${classIds.size}`);

  for (const classId of Array.from(classIds).sort()) {
    writeLog("COLLECT", `class ${classId}`);
    try {
      await collectKeysForClass(db, classId, keys);
    } catch (error) {
      writeLog("ERROR", `class ${classId} | ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const userDoc of users) {
    writeLog("COLLECT", `user ${userDoc.id}`);
    try {
      await collectKeysForUser(db, userDoc, keys);
    } catch (error) {
      writeLog("ERROR", `user ${userDoc.id} | ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  writeLog("COLLECT", "school-level files");
  try {
    await collectSchoolLevelKeys(db, schoolCode, classIds, keys);
  } catch (error) {
    writeLog("ERROR", `school-level files | ${error instanceof Error ? error.message : String(error)}`);
  }

  writeLog("COLLECT", `unique_paths=${keys.size}`);

  return {
    schoolCode,
    userCount: users.length,
    classCount: classIds.size,
    classIds: Array.from(classIds).sort(),
    folderPaths: Array.from(keys).sort(),
  };
}
