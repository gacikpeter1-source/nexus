/**
 * Chats Page
 * Main chat interface with list and selected chat
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import ChatList from '../../components/chat/ChatList';
import ChatWindow from '../../components/chat/ChatWindow';
import { getChat } from '../../services/firebase/chats';
import type { Chat } from '../../types';

export default function ChatsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);

  useEffect(() => {
    if (chatId) {
      loadChat(chatId);
    } else {
      setSelectedChat(null);
    }
  }, [chatId]);

  const loadChat = async (id: string) => {
    try {
      const chat = await getChat(id);
      setSelectedChat(chat);
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  const handleSelectChat = (id: string) => {
    navigate(`/chat/${id}`);
  };

  return (
    <Container className="max-w-7xl px-0">
      <div className="h-[calc(100vh-4rem)] flex bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        {/* Chat List Sidebar */}
        <div className={`${
          chatId ? 'hidden lg:block' : 'block'
        } w-full lg:w-80 border-r border-gray-200`}>
          <ChatList
            onSelectChat={handleSelectChat}
            selectedChatId={chatId}
          />
        </div>

        {/* Chat Window */}
        <div className={`${
          chatId ? 'block' : 'hidden lg:block'
        } flex-1`}>
          {chatId && selectedChat ? (
            <ChatWindow
              chatId={chatId}
              chatName={selectedChat.name}
            />
          ) : (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="text-8xl mb-6">💬</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {t('chat.selectChat')}
              </h2>
              <p className="text-gray-600 max-w-md">
                {t('chat.selectChatDescription')}
              </p>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

