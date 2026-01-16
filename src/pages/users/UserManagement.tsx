/**
 * User Management Page (Club Owners & Admins)
 * Manage users within clubs - add, edit, remove, change roles
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import RoleBadge from '../../components/common/RoleBadge';
import { PERMISSIONS } from '../../constants/permissions';

export default function UserManagement() {
  const { t } = useLanguage();
  const { can } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');

  // Mock users - will be replaced with Firestore data
  const mockUsers = [
    {
      id: '1',
      displayName: 'Ján Novák',
      email: 'jan@example.sk',
      role: 'trainer' as const,
      clubIds: ['club1'],
      emailVerified: true,
    },
    {
      id: '2',
      displayName: 'Mária Kovačová',
      email: 'maria@example.sk',
      role: 'assistant' as const,
      clubIds: ['club1'],
      emailVerified: true,
    },
    {
      id: '3',
      displayName: 'Peter Horváth',
      email: 'peter@example.sk',
      role: 'user' as const,
      clubIds: ['club1'],
      emailVerified: false,
    },
  ];

  const [users] = useState(mockUsers);

  // Check if user has permission to manage users
  if (!can(PERMISSIONS.CHANGE_USER_ROLE)) {
    return (
      <Container>
        <div className="text-center py-12">
          <p className="text-gray-600">{t('userManagement.noPermission')}</p>
        </div>
      </Container>
    );
  }

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t('userManagement.title')}
            </h1>
            <p className="mt-2 text-gray-600">
              {t('userManagement.subtitle')}
            </p>
          </div>

          <button
            onClick={() => alert(t('userManagement.addUserComingSoon'))}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
          >
            {t('userManagement.addUser')}
          </button>
        </div>

        {/* Search */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
          <input
            type="text"
            placeholder={t('userManagement.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
          />
        </div>

        {/* Users List */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('userManagement.table.user')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('userManagement.table.role')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('userManagement.table.status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('userManagement.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                          {u.displayName.charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {u.displayName}
                          </div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <RoleBadge role={u.role} size="sm" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {u.emailVerified ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {t('userManagement.table.verified')}
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          {t('userManagement.table.pending')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => alert(t('userManagement.editUserComingSoon'))}
                        className="text-primary hover:text-primary-600"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('userManagement.confirmRemove', { name: u.displayName }))) {
                            alert(t('userManagement.removeSuccess'));
                          }
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">{t('userManagement.noUsers')}</p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>{t('userManagement.info.title')}:</strong>{' '}
            {t('userManagement.info.description')}
          </p>
        </div>
      </div>
    </Container>
  );
}

