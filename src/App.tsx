import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'
import JoinRequestPage from './pages/JoinRequestPage'
import UserManagement from './pages/users/UserManagement'
import ClubsList from './pages/clubs/ClubsList'
import CreateClub from './pages/clubs/CreateClub'
import ClubView from './pages/clubs/ClubView'
import ClubSettings from './pages/clubs/ClubSettings'
import TeamView from './pages/teams/TeamView'
import CalendarView from './pages/calendar/CalendarView'
import CreateEvent from './pages/calendar/CreateEvent'
import EventDetail from './pages/calendar/EventDetail'
import ChatsPage from './pages/chat/ChatsPage'
import ParentDashboard from './pages/ParentDashboard'
import CreateChild from './pages/CreateChild'
import ChildSchedule from './pages/ChildSchedule'
import LeagueSchedule from './pages/LeagueSchedule'
import MediaGallery from './pages/MediaGallery'
import EventGallery from './pages/EventGallery'
import TakeAttendance from './pages/TakeAttendance'
import AttendanceHistory from './pages/AttendanceHistory'
import AttendanceDetail from './pages/AttendanceDetail'
import AdminPanel from './pages/AdminPanel'

// Constants
import { PERMISSIONS } from './constants/permissions'

function App() {
  return (
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
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/join-request" element={<JoinRequestPage />} />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute requiredPermission={PERMISSIONS.CHANGE_USER_ROLE}>
                        <UserManagement />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/admin" element={<AdminPanel />} />
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
                  <Route path="/clubs/:clubId/settings" element={<ClubSettings />} />
                  
                  {/* Team Routes */}
                  <Route path="/clubs/:clubId/teams/:teamId" element={<TeamView />} />
                  
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
                  
                  {/* Parent-Child Routes */}
                  <Route path="/parent/dashboard" element={<ParentDashboard />} />
                  <Route path="/parent/create-child" element={<CreateChild />} />
                  <Route path="/parent/child/:childId" element={<ChildSchedule />} />
                  <Route path="/parent/child/:childId/edit" element={<CreateChild />} />
                  
                  {/* League Schedule Routes */}
                  <Route path="/clubs/:clubId/teams/:teamId/league" element={<LeagueSchedule />} />
                  
                  {/* Media Gallery Routes */}
                  <Route path="/media" element={<MediaGallery />} />
                  <Route path="/clubs/:clubId/media" element={<MediaGallery />} />
                  <Route path="/clubs/:clubId/teams/:teamId/media" element={<MediaGallery />} />
                  <Route path="/events/:eventId/gallery" element={<EventGallery />} />
                  
                  {/* Attendance Routes */}
                  <Route path="/clubs/:clubId/teams/:teamId/attendance" element={<AttendanceHistory />} />
                  <Route path="/clubs/:clubId/teams/:teamId/attendance/take" element={<TakeAttendance />} />
                  <Route path="/clubs/:clubId/teams/:teamId/attendance/:attendanceId" element={<AttendanceDetail />} />
                  <Route path="/clubs/:clubId/teams/:teamId/attendance/:attendanceId/edit" element={<TakeAttendance />} />
                  <Route path="/events/:eventId/attendance" element={<TakeAttendance />} />
                  
                  {/* More routes will be added here */}
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
    </Routes>
  )
}

export default App

