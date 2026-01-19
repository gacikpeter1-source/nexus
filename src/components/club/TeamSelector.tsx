/**
 * Team Selector Component
 * Dropdown with quick search to select and navigate to teams
 * Shows only teams where user is a member
 * Mobile-first design
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Team } from '../../types';

interface TeamSelectorProps {
  clubId: string;
  teams: Team[];
  userId: string;
  currentTeamId?: string;
}

export default function TeamSelector({ clubId, teams, userId, currentTeamId }: TeamSelectorProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter teams where user is a member
  const userTeams = teams.filter(team => 
    team.members?.includes(userId)
  );

  // Filter teams by search term
  const filteredTeams = userTeams.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get current team name
  const currentTeam = teams.find(t => t.id === currentTeamId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectTeam = (teamId: string) => {
    navigate(`/clubs/${clubId}/teams/${teamId}`);
    setIsOpen(false);
    setSearchTerm('');
  };

  if (userTeams.length === 0) {
    return null; // Don't show selector if user is not a member of any team
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full sm:w-auto min-w-[200px] flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary hover:bg-white/5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-app-blue"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs sm:text-sm md:text-base font-medium truncate">
            {currentTeam ? currentTeam.name : 'Select Team'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 sm:w-5 sm:h-5 text-text-secondary transition-transform flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 sm:right-auto sm:min-w-[300px] mt-2 bg-app-card border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 sm:p-3 border-b border-white/10">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search teams..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                autoFocus
              />
            </div>
          </div>

          {/* Teams List */}
          <div className="max-h-[300px] overflow-y-auto">
            {filteredTeams.length > 0 ? (
              <div className="py-1">
                {filteredTeams.map((team) => {
                  const isCurrentTeam = team.id === currentTeamId;
                  
                  return (
                    <button
                      key={team.id}
                      onClick={() => handleSelectTeam(team.id)}
                      className={`
                        w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-2.5 text-left transition-colors
                        ${isCurrentTeam 
                          ? 'bg-app-blue/10 text-app-cyan' 
                          : 'hover:bg-white/5 text-text-primary'
                        }
                      `}
                    >
                      {/* Team Logo or Initial */}
                      {team.logoURL ? (
                        <img
                          src={team.logoURL}
                          alt={team.name}
                          className="w-8 h-8 rounded-lg object-cover border border-white/10 flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {team.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Team Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-sm font-semibold truncate">
                          {team.name}
                        </div>
                        {team.category && (
                          <div className="text-[10px] sm:text-xs text-text-muted truncate">
                            {team.category}
                          </div>
                        )}
                      </div>

                      {/* Current indicator */}
                      {isCurrentTeam && (
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-app-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <svg className="w-10 h-10 sm:w-12 sm:h-12 text-text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-xs sm:text-sm text-text-muted">No teams found</p>
              </div>
            )}
          </div>

          {/* Footer - Team count */}
          <div className="px-3 sm:px-4 py-2 border-t border-white/10 bg-app-secondary/50">
            <p className="text-[10px] sm:text-xs text-text-muted">
              {userTeams.length} {userTeams.length === 1 ? 'team' : 'teams'} available
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


