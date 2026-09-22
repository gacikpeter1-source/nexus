/**
 * Firebase Messages Service
 * Handles all chat message operations
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc,
  getDocs,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import type { Message } from '../../types';
import { NotificationManager } from '../notifications/NotificationManager';

// ==================== Send Message ====================

export async function sendMessage(
  clubId: string,
  teamId: string,
  userId: string,
  text: string,
  senderName: string,
  senderPhotoURL?: string,
  replyTo?: string
): Promise<string> {
  const messageData = {
    text: text.trim(),
    senderId: userId,
    senderName,
    senderPhotoURL: senderPhotoURL || '',
    clubId,
    teamId,
    replyTo: replyTo || null,
    isPinned: false,
    isDeleted: false,
    isEdited: false,
    reactions: {},
    readBy: [],
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  const messagesRef = collection(db, 'clubs', clubId, 'teams', teamId, 'messages');
  const docRef = await addDoc(messagesRef, messageData);

  // Send notifications to team members
  try {
    const teamDoc = await getDoc(doc(db, 'clubs', clubId));
    if (teamDoc.exists()) {
      const clubData = teamDoc.data();
      const team = clubData.teams?.find((t: any) => t.id === teamId);
      if (team) {
        await NotificationManager.onTeamChatMessage({
          teamId,
          clubId,
          teamName: team.name,
          senderId: userId,
          senderName,
          message: text,
        });
      }
    }
  } catch (error) {
    console.error('Error sending chat notification:', error);
    // Don't fail message send if notification fails
  }

  return docRef.id;
}

// ==================== Delete Message ====================

export async function deleteMessage(
  clubId: string,
  teamId: string,
  messageId: string,
  hardDelete: boolean = false
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  if (hardDelete) {
    // Permanently delete
    await deleteDoc(messageRef);
  } else {
    // Soft delete (mark as deleted)
    await updateDoc(messageRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      text: '[Message deleted]',
    });
  }
}

// ==================== Reactions ====================

export async function addReaction(
  clubId: string,
  teamId: string,
  messageId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  // Get current reactions
  const messageDoc = await getDoc(messageRef);
  if (!messageDoc.exists()) throw new Error('Message not found');
  
  const message = messageDoc.data() as Message;
  const reactions = message.reactions || {};
  
  // Add user to emoji array
  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }
  
  if (!reactions[emoji].includes(userId)) {
    reactions[emoji].push(userId);
  }
  
  await updateDoc(messageRef, {
    reactions,
    updatedAt: serverTimestamp(),
  });
}

export async function removeReaction(
  clubId: string,
  teamId: string,
  messageId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  // Get current reactions
  const messageDoc = await getDoc(messageRef);
  if (!messageDoc.exists()) throw new Error('Message not found');
  
  const message = messageDoc.data() as Message;
  const reactions = message.reactions || {};
  
  // Remove user from emoji array
  if (reactions[emoji]) {
    reactions[emoji] = reactions[emoji].filter((id: string) => id !== userId);
    
    // Remove emoji key if no users left
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  }
  
  await updateDoc(messageRef, {
    reactions,
    updatedAt: serverTimestamp(),
  });
}

// ==================== Pin Message ====================

export async function pinMessage(
  clubId: string,
  teamId: string,
  messageId: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  await updateDoc(messageRef, {
    isPinned: true,
    pinnedBy: userId,
    pinnedAt: serverTimestamp(),
    readBy: [userId], // Trainer who pinned has read it
    updatedAt: serverTimestamp(),
  });
}

export async function unpinMessage(
  clubId: string,
  teamId: string,
  messageId: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  await updateDoc(messageRef, {
    isPinned: false,
    pinnedBy: null,
    pinnedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function markPinnedAsRead(
  clubId: string,
  teamId: string,
  messageId: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'teams', teamId, 'messages', messageId);
  
  await updateDoc(messageRef, {
    readBy: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}

// ==================== Upload File ====================

export async function uploadMessageFile(
  clubId: string,
  teamId: string,
  file: File,
  userId: string
): Promise<{ url: string; name: string; size: number; type: 'image' | 'file' }> {
  const fileExtension = file.name.split('.').pop();
  const fileName = `${Date.now()}_${userId}.${fileExtension}`;
  const storageRef = ref(storage, `clubs/${clubId}/teams/${teamId}/chat/${fileName}`);
  
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  
  const type = file.type.startsWith('image/') ? 'image' : 'file';
  
  return {
    url,
    name: file.name,
    size: file.size,
    type,
  };
}

// ==================== Send Message with File ====================

export async function sendMessageWithFile(
  clubId: string,
  teamId: string,
  userId: string,
  text: string,
  senderName: string,
  file: File,
  senderPhotoURL?: string,
  replyTo?: string
): Promise<string> {
  // Upload file first
  const attachment = await uploadMessageFile(clubId, teamId, file, userId);
  
  const messageData = {
    text: text.trim() || '',
    senderId: userId,
    senderName,
    senderPhotoURL: senderPhotoURL || '',
    clubId,
    teamId,
    replyTo: replyTo || null,
    isPinned: false,
    isDeleted: false,
    isEdited: false,
    reactions: {},
    readBy: [],
    attachments: [attachment],
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  const messagesRef = collection(db, 'clubs', clubId, 'teams', teamId, 'messages');
  const docRef = await addDoc(messagesRef, messageData);

  // Send notifications to team members
  try {
    const teamDoc = await getDoc(doc(db, 'clubs', clubId));
    if (teamDoc.exists()) {
      const clubData = teamDoc.data();
      const team = clubData.teams?.find((t: any) => t.id === teamId);
      if (team) {
        await NotificationManager.onTeamChatMessage({
          teamId,
          clubId,
          teamName: team.name,
          senderId: userId,
          senderName,
          message: text || 'Sent a file',
        });
      }
    }
  } catch (error) {
    console.error('Error sending chat notification:', error);
    // Don't fail message send if notification fails
  }

  return docRef.id;
}

// ==================== Get Messages ====================

export function subscribeToMessages(
  clubId: string,
  teamId: string,
  callback: (messages: Message[]) => void,
  limitCount: number = 50
): () => void {
  const messagesRef = collection(db, 'clubs', clubId, 'teams', teamId, 'messages');
  const q = query(
    messagesRef,
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Message[];
    
    // Reverse to show oldest first
    callback(messages.reverse());
  });
  
  return unsubscribe;
}

export async function getPinnedMessages(
  clubId: string,
  teamId: string
): Promise<Message[]> {
  const messagesRef = collection(db, 'clubs', clubId, 'teams', teamId, 'messages');
  const q = query(
    messagesRef,
    where('isPinned', '==', true),
    orderBy('pinnedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Message[];
}
