import { useState, useEffect, useRef } from 'react';
import useWorkspaceStore from '../store/workspaceStore';
import NoteNode from './NoteNode';
import { searchNotes } from '../api/workspaces';

type SearchMode = 'metadata' | 'full';

export default function SearchPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('metadata');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const timeoutRef = useRef<number | null>(null);

  // Debounce search query
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Perform search when debounced query or mode changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }

    async function performSearch() {
      setIsSearching(true);
      try {
        const results = await searchNotes(debouncedQuery, searchMode);
        setSearchResults(results);
      } catch (error) {
        console.error('[SearchPanel] Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }

    performSearch();
  }, [debouncedQuery, searchMode]);

  return (
    <div>
      {/* Search Input */}
      <div style={{ padding: '0 12px 12px 12px' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              border: '1px solid var(--border-hover)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: 'inherit',
              backgroundColor: 'var(--bg-main)',
              transition: 'all 0.15s',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-hover)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <span className="material-symbols-outlined" style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '18px',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none'
          }}>
            search
          </span>
        </div>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '8px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          userSelect: 'none'
        }}>
          <input
            type="checkbox"
            checked={searchMode === 'full'}
            onChange={(e) => setSearchMode(e.target.checked ? 'full' : 'metadata')}
            style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
          />
          Also search content
        </label>
      </div>

      {/* Search Results */}
      {debouncedQuery.trim() && (
        <div style={{
          marginLeft: '8px',
          marginRight: '8px',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {isSearching ? (
            <div style={{
              padding: '16px',
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{
              padding: '16px',
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              No results found
            </div>
          ) : (
            <>
              <div style={{
                padding: '8px 12px 4px 12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                {searchMode === 'full' && ' (content search)'}
              </div>
              {searchResults.map((note) => {
                const workspace = workspaces.find(w => w.id === note.workspace_id);
                if (!workspace) return null;

                return (
                  <NoteNode
                    key={note.id}
                    note={note}
                    workspaceId={note.workspace_id}
                    onUpdate={() => {}}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
