/**
 * Chats Page
 * Main chat interface — handles both direct/group chats and team chats.
 * Routes: /chat, /chat/:chatId, /chat/team/:clubId/:teamId
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import ChatList from '../../components/chat/ChatList';
import ChatWindow from '../../components/chat/ChatWindow';
import TeamChat from '../../components/chat/TeamChat';
import { getChat } from '../../services/firebase/chats';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { Chat, Team } from '../../types';

export default function ChatsPage() {
  const { chatId, clubId, teamId } = useParams<{ chatId?: string; clubId?: string; teamId?: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<{ team: Team; clubId: string; isTrainer: boolean } | null>(null);

  // Load regular chat when chatId param changes
  useEffect(() => {
    if (chatId) {
      getChat(chatId).then(setSelectedChat).catch(console.error);
    } else {
      setSelectedChat(null);
    }
  }, [chatId]);

  // Load team data when clubId/teamId params change
  useEffect(() => {
    if (!clubId || !teamId || !user) { setSelectedTeam(null); return; }

    getDoc(doc(db, 'clubs', clubId)).then(snap => {
      if (!snap.exists()) return;
      const clubData = snap.data();
      const team = (clubData.teams || []).find((t: Team) => t.id === teamId);
      if (!team) return;
      const isTrainer = team.trainers?.includes(user.id) || clubData.ownerId === user.id || clubData.trainers?.includes(user.id);
      setSelectedTeam({ team, clubId, isTrainer: !!isTrainer });
    }).catch(console.error);
  }, [clubId, teamId, user?.id]);

  const isTeamChat = !!(clubId && teamId);
  const hasSelection = !!(chatId || isTeamChat);

  return (
    <Container className="max-w-7xl px-0">
      <div className="h-[calc(100vh-4rem)] flex bg-app-card shadow-card rounded-2xl border border-white/10 overflow-hidden">
        {/* Chat List Sidebar */}
        <div className={`${hasSelection ? 'hidden lg:block' : 'block'} w-full lg:w-80 border-r border-white/10`}>
          <ChatList
            onSelectChat={(id) => navigate(`/chat/${id}`)}
            onSelectTeamChat={(cId, tId) => navigate(`/chat/team/${cId}/${tId}`)}
            selectedChatId={chatId}
            selectedTeamId={teamId}
          />
        </div>

        {/* Right panel */}
        <div className={`${hasSelection ? 'block' : 'hidden lg:block'} flex-1 overflow-hidden`}>
          {isTeamChat && selectedTeam ? (
            <TeamChat
              clubId={selectedTeam.clubId}
              teamId={teamId!}
              team={selectedTeam.team}
              isTrainer={selectedTeam.isTrainer}
            />
          ) : chatId && selectedChat ? (
            <ChatWindow chatId={chatId} chatName={selectedChat.name} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <h2 className="text-2xl font-bold text-text-primary mb-2">{t('chat.selectChat')}</h2>
              <p className="text-text-secondary max-w-md">{t('chat.selectChatDescription')}</p>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

