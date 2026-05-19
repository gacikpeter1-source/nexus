/**
 * Team Invite Codes Component
 * Manage invite codes for team join requests
 */

import { useState } from 'react';
import { generateTeamInviteCode, deleteTeamInviteCode } from '../../services/firebase/teams';
import type { Team } from '../../types';

interface TeamInviteCodesProps {
  clubId: string;
  teamId: string;
  team: Team;
  userId: string;
  onUpdate: () => void;
}

export default function TeamInviteCodes({ clubId, teamId, team, userId, onUpdate }: TeamInviteCodesProps) {
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');

    try {
      await generateTeamInviteCode(clubId, teamId, userId);
      onUpdate();
    } catch (err: any) {
      console.error('Error generating invite code:', err);
      setError('Failed to generate invite code');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('Are you sure you want to delete this invite code?')) {
      return;
    }

    setDeleting(code);
    setError('');

    try {
      await deleteTeamInviteCode(clubId, teamId, code);
      onUpdate();
    } catch (err: any) {
      console.error('Error deleting invite code:', err);
      setError('Failed to delete invite code');
    } finally {
      setDeleting(null);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const inviteCodes = team.inviteCodes || [];

  return (
    <div className="bg-app-card rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Invite Codes</h3>
          <p className="text-xs text-text-muted mt-1">
            Generate codes to help identify valid join requests
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold"
        >
          {generating ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate Code
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-chart-pink/20 border border-chart-pink/30 rounded-lg p-3 mb-4">
          <p className="text-sm text-chart-pink">{error}</p>
        </div>
      )}

      {inviteCodes.length === 0 ? (
        <div className="text-center py-6">
          <svg className="w-12 h-12 mx-auto mb-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <p className="text-sm text-text-secondary">No invite codes yet</p>
          <p className="text-xs text-text-muted mt-1">Generate a code to share with potential team members</p>
        </div>
      ) : (
        <div className="space-y-2">
          {inviteCodes.map((inviteCode: any) => (
            <div
              key={inviteCode.code}
              className="bg-app-secondary border border-white/10 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-lg font-bold text-app-cyan tracking-wider">
                    {inviteCode.code}
                  </code>
                  {inviteCode.usageCount > 0 && (
                    <span className="text-xs text-text-muted">
                      ({inviteCode.usageCount} {inviteCode.usageCount === 1 ? 'use' : 'uses'})
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Created {new Date(inviteCode.createdAt?.toDate?.() || inviteCode.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(inviteCode.code)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  title="Copy code"
                >
                  {copied === inviteCode.code ? (
                    <svg className="w-5 h-5 text-chart-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(inviteCode.code)}
                  disabled={deleting === inviteCode.code}
                  className="p-2 hover:bg-chart-pink/20 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete code"
                >
                  {deleting === inviteCode.code ? (
                    <svg className="animate-spin h-5 w-5 text-chart-pink" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-chart-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 bg-app-blue/10 border border-app-blue/30 rounded-lg p-3">
        <p className="text-xs text-app-cyan">
          ℹ️ Share these codes with potential members. They can use them when requesting to join, making it easier to identify valid requests.
        </p>
      </div>
    </div>
  );
}
