import {
  collection, addDoc, getDocs, deleteDoc,
  doc, query, where, orderBy
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import type { TeamDocument } from '../../types/documents';

const DOCS_MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10 MB per file
const DOCS_TOTAL_LIMIT_BYTES = 15 * 1024 * 1024; // 15 MB per team

function docsCollection(clubId: string) {
  return collection(db, 'clubs', clubId, 'documents');
}

export async function getTeamDocuments(clubId: string, teamId: string): Promise<TeamDocument[]> {
  const snap = await getDocs(
    query(docsCollection(clubId), where('teamId', '==', teamId), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamDocument));
}

export async function uploadTeamDocument(
  clubId: string,
  teamId: string,
  file: File,
  uploadedBy: string,
  uploadedByName: string,
  existingTotalBytes: number,
  onProgress?: (pct: number) => void
): Promise<TeamDocument> {
  if (file.size > DOCS_MAX_FILE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }
  if (existingTotalBytes + file.size > DOCS_TOTAL_LIMIT_BYTES) {
    throw new Error('STORAGE_FULL');
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const storagePath = `clubs/${clubId}/teams/${teamId}/documents/${timestamp}_${safeName}`;
  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file);

  const downloadUrl = await new Promise<string>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      snapshot => {
        if (onProgress) {
          onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        }
      },
      reject,
      async () => {
        resolve(await getDownloadURL(uploadTask.snapshot.ref));
      }
    );
  });

  const docData: Omit<TeamDocument, 'id'> = {
    teamId,
    clubId,
    name: file.name,
    fileType: file.type,
    fileSize: file.size,
    url: downloadUrl,
    storagePath,
    uploadedBy,
    uploadedByName,
    createdAt: new Date().toISOString(),
  };

  const docRef = await addDoc(docsCollection(clubId), docData);
  return { ...docData, id: docRef.id };
}

export async function deleteTeamDocument(
  clubId: string,
  docId: string,
  storagePath: string
): Promise<void> {
  await deleteObject(ref(storage, storagePath));
  await deleteDoc(doc(db, 'clubs', clubId, 'documents', docId));
}

export { DOCS_TOTAL_LIMIT_BYTES };
