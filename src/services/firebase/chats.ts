/**
 * Firebase Service: Chats & Messaging
 * Real-time chat functionality
 * Based on: docs/02-database-schema.md
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Chat, Message } from '../../types';

/**
 * Create a new chat
 */
export async function createChat(chatData: {
  name: string;
  type: 'team' | 'club' | 'oneToOne' | 'group';
  participants: string[];
  createdBy: string;
  clubId?: string;
  teamId?: string;
}): Promise<string> {
  try {
    const chatRef = doc(collection(db, 'chats'));

    // Initialize unread counts for all participants
    const unreadCounts: { [userId: string]: number } = {};
    chatData.participants.forEach(userId => {
      unreadCounts[userId] = 0;
    });

    const newChat: Partial<Chat> = {
      name: chatData.name,
      type: chatData.type,
      participants: chatData.participants,
      createdBy: chatData.createdBy,
      clubId: chatData.clubId,
      teamId: chatData.teamId,
      unreadCounts: unreadCounts,
      isArchived: false,
      isPinned: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(chatRef, newChat);
    return chatRef.id;
  } catch (error) {
    console.error('Error creating chat:', error);
    throw error;
  }
}

/**
 * Get chat by ID
 */
export async function getChat(chatId: string): Promise<Chat | null> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      return {
        id: chatDoc.id,
        ...chatDoc.data(),
      } as Chat;
    }

    return null;
  } catch (error) {
    console.error('Error getting chat:', error);
    throw error;
  }
}

/**
 * Get user's chats
 */
export async function getUserChats(userId: string): Promise<Chat[]> {
  try {
    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('participants', 'array-contains', userId),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Chat[];
  } catch (error) {
    console.error('Error getting user chats:', error);
    throw error;
  }
}

/**
 * Get or create one-to-one chat
 */
export async function getOrCreateOneToOneChat(
  userId1: string,
  userId2: string,
  user1Name: string,
  user2Name: string
): Promise<string> {
  try {
    // Check if chat already exists
    const chatsRef = collection(db, 'chats');
    const q = query(
      chatsRef,
      where('type', '==', 'oneToOne'),
      where('participants', 'array-contains', userId1)
    );
    const querySnapshot = await getDocs(q);

    // Find existing chat with both users
    for (const docSnap of querySnapshot.docs) {
      const chat = docSnap.data() as Chat;
      if (chat.participants.includes(userId2)) {
        return docSnap.id;
      }
    }

    // Create new chat if doesn't exist
    const chatName = `${user1Name} & ${user2Name}`;
    return await createChat({
      name: chatName,
      type: 'oneToOne',
      participants: [userId1, userId2],
      createdBy: userId1,
    });
  } catch (error) {
    console.error('Error getting/creating one-to-one chat:', error);
    throw error;
  }
}

/**
 * Send a message
 */
export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
  senderName?: string,
  senderPhotoURL?: string
): Promise<string> {
  try {
    const messagesRef = collection(db, 'chats', chatId, 'messages');

    const newMessage: Partial<Message> = {
      text,
      senderId,
      senderName,
      senderPhotoURL,
      timestamp: Timestamp.now(),
      isDeleted: false,
      isEdited: false,
    };

    const messageDoc = await addDoc(messagesRef, newMessage);

    // Update chat's last message and unread counts
    const chatRef = doc(db, 'chats', chatId);
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      const chat = chatDoc.data() as Chat;
      const unreadCounts = { ...chat.unreadCounts };

      // Increment unread count for all participants except sender
      chat.participants.forEach(userId => {
        if (userId !== senderId) {
          unreadCounts[userId] = (unreadCounts[userId] || 0) + 1;
        }
      });

      await updateDoc(chatRef, {
        lastMessage: {
          text,
          senderId,
          timestamp: Timestamp.now(),
        },
        unreadCounts,
        updatedAt: Timestamp.now(),
      });
    }

    return messageDoc.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

/**
 * Get messages for a chat
 */
export async function getMessages(
  chatId: string,
  limitCount: number = 50
): Promise<Message[]> {
  try {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(
      messagesRef,
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse() as Message[]; // Reverse to show oldest first
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
}

/**
 * Subscribe to messages (real-time)
 */
export function subscribeToMessages(
  chatId: string,
  callback: (messages: Message[]) => void,
  limitCount: number = 50
): () => void {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(
    messagesRef,
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
      }))
      .reverse() as Message[];

    callback(messages);
  });

  return unsubscribe;
}

/**
 * Subscribe to user's chats (real-time)
 */
export function subscribeToUserChats(
  userId: string,
  callback: (chats: Chat[]) => void
): () => void {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const chats = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Chat[];

    callback(chats);
  });

  return unsubscribe;
}

/**
 * Mark chat as read
 */
export async function markChatAsRead(chatId: string, userId: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      const chat = chatDoc.data() as Chat;
      const unreadCounts = { ...chat.unreadCounts };
      unreadCounts[userId] = 0;

      await updateDoc(chatRef, {
        unreadCounts,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error marking chat as read:', error);
    throw error;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  try {
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageRef, {
      isDeleted: true,
      text: '[Message deleted]',
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

/**
 * Edit a message
 */
export async function editMessage(
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  try {
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageRef, {
      text: newText,
      isEdited: true,
      editedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error editing message:', error);
    throw error;
  }
}

/**
 * Add reaction to message
 */
export async function addReaction(
  chatId: string,
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  try {
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);

    if (messageDoc.exists()) {
      const message = messageDoc.data() as Message;
      const reactions = message.reactions ? { ...message.reactions } : {};

      if (!reactions[emoji]) {
        reactions[emoji] = [];
      }

      if (!reactions[emoji].includes(userId)) {
        reactions[emoji].push(userId);
      }

      await updateDoc(messageRef, { reactions });
    }
  } catch (error) {
    console.error('Error adding reaction:', error);
    throw error;
  }
}

/**
 * Remove reaction from message
 */
export async function removeReaction(
  chatId: string,
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  try {
    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    const messageDoc = await getDoc(messageRef);

    if (messageDoc.exists()) {
      const message = messageDoc.data() as Message;
      const reactions = message.reactions ? { ...message.reactions } : {};

      if (reactions[emoji]) {
        reactions[emoji] = reactions[emoji].filter(id => id !== userId);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      }

      await updateDoc(messageRef, { reactions });
    }
  } catch (error) {
    console.error('Error removing reaction:', error);
    throw error;
  }
}

/**
 * Archive/unarchive chat
 */
export async function toggleArchiveChat(chatId: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      const chat = chatDoc.data() as Chat;
      await updateDoc(chatRef, {
        isArchived: !chat.isArchived,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error toggling archive:', error);
    throw error;
  }
}

/**
 * Pin/unpin chat
 */
export async function togglePinChat(chatId: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    const chatDoc = await getDoc(chatRef);

    if (chatDoc.exists()) {
      const chat = chatDoc.data() as Chat;
      await updateDoc(chatRef, {
        isPinned: !chat.isPinned,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error toggling pin:', error);
    throw error;
  }
}

/**
 * Delete chat (only creator or admin)
 */
export async function deleteChat(chatId: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', chatId);
    await deleteDoc(chatRef);
    // Note: Messages subcollection should be deleted by Cloud Functions
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}

/**
 * Get total unread count for user
 */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  try {
    const chats = await getUserChats(userId);
    let total = 0;

    chats.forEach(chat => {
      if (chat.unreadCounts && chat.unreadCounts[userId]) {
        total += chat.unreadCounts[userId];
      }
    });

    return total;
  } catch (error) {
    console.error('Error getting total unread count:', error);
    return 0;
  }
}

