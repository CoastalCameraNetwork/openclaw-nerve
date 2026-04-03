/**
 * LearningExtractor UI Component
 *
 * Displays extracted learnings from session conversations.
 * Shows learnings by type (correction, guidance, skill-knowledge, etc.)
 * and allows reviewing routed destinations (SKILL, CLAUDE_MD, AUTO_MEMORY, etc.)
 */

import { useState, useCallback, useEffect } from 'react';
import { Brain, Book, FileText, Database, AlertCircle, Loader2, RefreshCw, Search, Filter } from 'lucide-react';

interface Learning {
  type: 'correction' | 'guidance' | 'skill-knowledge' | 'preference' | 'discovery';
  content: string;
  confidence: number;
  source?: {
    messageIndex: number;
    timestamp?: number;
  };
  tags?: string[];
}

interface RoutedLearning {
  learning: Learning;
  destination: 'SKILL' | 'CLAUDE_MD' | 'AUTO_MEMORY' | 'IMPROVEMENT_BACKLOG';
  reasoning: string;
}

interface LearningExtractorProps {
  sessionId?: string;
  autoExtract?: boolean;
  onLearningsExtracted?: (learnings: Learning[], routed: RoutedLearning[]) => void;
}

const TYPE_CONFIG: Record<Learning['type'], { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  correction: { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', label: 'Correction' },
  guidance: { icon: Brain, color: 'text-blue-600 dark:text-blue-400', label: 'Guidance' },
  'skill-knowledge': { icon: Book, color: 'text-purple-600 dark:text-purple-400', label: 'Skill Knowledge' },
  preference: { icon: FileText, color: 'text-green-600 dark:text-green-400', label: 'Preference' },
  discovery: { icon: Database, color: 'text-orange-600 dark:text-orange-400', label: 'Discovery' },
};

const DESTINATION_CONFIG: Record<RoutedLearning['destination'], { color: string; label: string }> = {
  SKILL: { color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20', label: 'Skill Pattern' },
  CLAUDE_MD: { color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20', label: 'CLAUDE.md' },
  AUTO_MEMORY: { color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20', label: 'Auto Memory' },
  IMPROVEMENT_BACKLOG: { color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20', label: 'Improvement Backlog' },
};

export function LearningExtractor({ sessionId, autoExtract = false, onLearningsExtracted }: LearningExtractorProps) {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [routed, setRouted] = useState<RoutedLearning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<Learning['type'] | 'all'>('all');
  const [selectedDestination, setSelectedDestination] = useState<RoutedLearning['destination'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const extractLearnings = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);
    try {
      // In production, this would fetch the session and extract learnings
      // For now, we use the direct extraction endpoint
      const response = await fetch('/api/turbo/extract-learnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to extract learnings');
      }

      const data: { learnings: Learning[]; routed: RoutedLearning[] } = await response.json();
      setLearnings(data.learnings || []);
      setRouted(data.routed || []);
      onLearningsExtracted?.(data.learnings || [], data.routed || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, onLearningsExtracted]);

  const fetchStoredLearnings = useCallback(async () => {
    try {
      const response = await fetch('/api/turbo/learnings', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stored learnings');
      }

      const data = await response.json();
      // Transform memory store entries to Learning format
      const transformedLearnings: Learning[] = (data.entries || []).map((entry: any) => ({
        type: entry.source === 'session-learning' ? 'guidance' : 'discovery' as Learning['type'],
        content: entry.content,
        confidence: 0.9,
        tags: entry.tags,
      }));
      setLearnings(transformedLearnings);
    } catch (err) {
      console.error('Failed to fetch stored learnings:', err);
    }
  }, []);

  useEffect(() => {
    if (sessionId && autoExtract) {
      extractLearnings();
    } else if (!sessionId) {
      fetchStoredLearnings();
    }
  }, [sessionId, autoExtract, extractLearnings, fetchStoredLearnings]);

  const filteredLearnings = learnings.filter(l => {
    if (selectedType !== 'all' && l.type !== selectedType) return false;
    if (searchQuery && !l.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredRouted = routed.filter(r => {
    if (selectedDestination !== 'all' && r.destination !== selectedDestination) return false;
    if (searchQuery && !r.learning.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-purple-500" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Learning Extractor
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {learnings.length} learnings extracted
              {routed.length > 0 && ` • ${routed.length} routed`}
            </p>
          </div>
        </div>
        <button
          onClick={sessionId ? extractLearnings : fetchStoredLearnings}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learnings..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as Learning['type'] | 'all')}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Types</option>
            <option value="correction">Corrections</option>
            <option value="guidance">Guidance</option>
            <option value="skill-knowledge">Skill Knowledge</option>
            <option value="preference">Preferences</option>
            <option value="discovery">Discoveries</option>
          </select>
          {routed.length > 0 && (
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value as RoutedLearning['destination'] | 'all')}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Destinations</option>
              <option value="SKILL">Skill Patterns</option>
              <option value="CLAUDE_MD">CLAUDE.md</option>
              <option value="AUTO_MEMORY">Auto Memory</option>
              <option value="IMPROVEMENT_BACKLOG">Improvement Backlog</option>
            </select>
          )}
        </div>
      </div>

      {loading && !learnings.length && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Extracting learnings...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Routed Learnings */}
      {routed.length > 0 && filteredRouted.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Routed Learnings ({filteredRouted.length})
          </h4>
          {filteredRouted.map((item, idx) => {
            const TypeIcon = TYPE_CONFIG[item.learning.type].icon;
            const destConfig = DESTINATION_CONFIG[item.destination];

            return (
              <div
                key={`routed-${idx}`}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <TypeIcon className={`w-4 h-4 ${TYPE_CONFIG[item.learning.type].color}`} />
                  <span className={`px-2 py-0.5 text-xs rounded-full ${destConfig.color}`}>
                    {destConfig.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Confidence: {Math.round(item.learning.confidence * 100)}%
                  </span>
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100">{item.learning.content}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  → {item.reasoning}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* All Learnings */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {routed.length > 0 ? 'All Extracted Learnings' : 'Learnings'} ({filteredLearnings.length})
        </h4>
        {filteredLearnings.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No learnings found</p>
            {sessionId && (
              <button
                onClick={extractLearnings}
                className="mt-2 text-sm text-purple-600 hover:underline dark:text-purple-400"
              >
                Extract from session
              </button>
            )}
          </div>
        ) : (
          filteredLearnings.map((learning, idx) => {
            const TypeIcon = TYPE_CONFIG[learning.type].icon;

            return (
              <div
                key={`learning-${idx}`}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-start gap-3"
              >
                <TypeIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${TYPE_CONFIG[learning.type].color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">{learning.content}</p>
                  {learning.tags && learning.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {learning.tags.map((tag, tagIdx) => (
                        <span
                          key={tagIdx}
                          className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
