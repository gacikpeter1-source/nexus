import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import UserManagement from './pages/users/UserManagement'
import ClubsList from './pages/clubs/ClubsList'
import CreateClub from './pages/clubs/CreateClub'
import ClubView from './pages/clubs/ClubView'
import CalendarView from './pages/calendar/CalendarView'
import CreateEvent from './pages/calendar/CreateEvent'
import EventDetail from './pages/calendar/EventDetail'
import ChatsPage from './pages/chat/ChatsPage'

// Constants
import { PERMISSIONS } from './constants/permissions'

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute requiredPermission={PERMISSIONS.CHANGE_USER_ROLE}>
                        <UserManagement />
                      </ProtectedRoute>
                    }
                  />
                  {/* Clubs Routes */}
                  <Route path="/clubs" element={<ClubsList />} />
                  <Route
                    path="/clubs/create"
                    element={
                      <ProtectedRoute requiredPermission={PERMISSIONS.CREATE_CLUB}>
                        <CreateClub />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/clubs/:clubId" element={<ClubView />} />
                  
                  {/* Calendar Routes */}
                  <Route path="/calendar" element={<CalendarView />} />
                  <Route
                    path="/calendar/create"
                    element={
                      <ProtectedRoute requiredPermission={PERMISSIONS.CREATE_PERSONAL_EVENT}>
                        <CreateEvent />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/calendar/events/:eventId" element={<EventDetail />} />
                  
                  {/* Chat Routes */}
                  <Route path="/chat" element={<ChatsPage />} />
                  <Route path="/chat/:chatId" element={<ChatsPage />} />
                  
                  {/* More routes will be added here */}
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App

