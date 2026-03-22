/**
 * Session File System Reader
 *
 * Reads agent session transcripts directly from the OpenClaw filesystem.
 * Used when gateway API calls fail or don't track orchestrator sessions.
 *
 * Session files are stored at: /root/.openclaw/agents/{agent}/sessions/{uuid}.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import { getKanbanStore } from '../lib/kanban-store.js';

const OPENCLAW_AGENTS_DIR = '/root/.openclaw/agents';

export interface SessionTranscript {
  agentName: string;
  sessionId: string;
  sessionKey: string;
  label?: string;
  createdAt: number;
  updatedAt: number;
  status: 'running' | 'completed' | 'failed';
  output: string;
  error?: string;
  taskId?: string; // Extracted from label if it matches orch-{taskId}-{agentName}
}

interface SessionMessage {
  type: string;
  role?: string;
  content?: Array<{ type: string; text?: string }>;
  text?: string;
  timestamp?: string;
  error?: string;
}

/**
 * List all agent directories.
 */
function listAgentDirs(): string[] {
  try {
    if (!fs.existsSync(OPENCLAW_AGENTS_DIR)) {
      return [];
    }
    const entries = fs.readdirSync(OPENCLAW_AGENTS_DIR, { withFileTypes: true });
    return entries.filter(d => d.isDirectory()).map(d => d.name);
  } catch (error) {
    console.error('Failed to list agent directories:', error);
    return [];
  }
}

/**
 * List all session files for an agent, sorted by modification time (newest first).
 */
function listAgentSessions(agentName: string): Array<{ file: string; mtime: number }> {
  const sessionsDir = path.join(OPENCLAW_AGENTS_DIR, agentName, 'sessions');
  try {
    if (!fs.existsSync(sessionsDir)) {
      return [];
    }
    const files = fs.readdirSync(sessionsDir);
    const sessionFiles = files
      .filter(f => f.endsWith('.jsonl') && !f.includes('.deleted'))
      .map(file => {
        const filePath = path.join(sessionsDir, file);
        const stat = fs.statSync(filePath);
        return { file, mtime: stat.mtimeMs };
      });
    return sessionFiles.sort((a, b) => b.mtime - a.mtime); // Newest first
  } catch (error) {
    console.error(`Failed to list sessions for agent ${agentName}:`, error);
    return [];
  }
}

/**
 * Parse a session transcript file and extract key information.
 */
function parseSessionTranscript(
  agentName: string,
  sessionId: string,
  filePath: string,
): SessionTranscript | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return null;
    }

    let label: string | undefined;
    let createdAt = 0;
    let updatedAt = 0;
    let outputParts: string[] = [];
    let error: string | undefined;
    let taskId: string | undefined;

    // Parse each line as JSON
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as SessionMessage;

        // Extract timestamp
        if (msg.timestamp) {
          const ts = new Date(msg.timestamp).getTime();
          if (ts > 0) {
            if (createdAt === 0 || ts < createdAt) createdAt = ts;
            if (ts > updatedAt) updatedAt = ts;
          }
        }

        // Extract label from session metadata message
        if (msg.type === 'session.metadata' || msg.type === 'session_start') {
          const meta = msg as unknown as Record<string, unknown>;
          if (typeof meta.label === 'string') {
            label = meta.label;
            // Extract task ID from label format: orch-{taskId}-{agentName}
            const match = label.match(/^orch-(.+)-([a-zA-Z0-9_-]+)$/);
            if (match) {
              taskId = match[1];
            }
          }
        }

        // Extract assistant output (the final result)
        if (msg.role === 'assistant' && msg.content) {
          for (const part of msg.content) {
            if (part.type === 'text' && part.text) {
              outputParts.push(part.text);
            }
          }
        }

        // Extract error messages
        if (msg.type === 'error' || msg.error) {
          error = msg.error || msg.text || 'Unknown error';
        }
      } catch (parseError) {
        // Skip malformed lines
        continue;
      }
    }

    // Determine status based on content
    const lastLine = lines[lines.length - 1];
    let status: 'running' | 'completed' | 'failed' = 'completed';

    try {
      const lastMsg = JSON.parse(lastLine) as Record<string, unknown>;
      if (lastMsg.type === 'error' || lastMsg.error) {
        status = 'failed';
      } else if (lastMsg.type === 'session.end' || lastMsg.type === 'session_complete') {
        status = 'completed';
      } else if (lastMsg.role === 'assistant') {
        status = 'completed';
      }
    } catch {
      // If we can't parse the last line, assume completed if we have output
      status = outputParts.length > 0 ? 'completed' : 'running';
    }

    // Use fallback timestamps if not found
    const now = Date.now();
    if (createdAt === 0) createdAt = now - 60000; // 1 minute ago
    if (updatedAt === 0) updatedAt = now;

    return {
      agentName,
      sessionId,
      sessionKey: `${agentName}:${sessionId}`,
      label,
      taskId,
      createdAt,
      updatedAt,
      status,
      output: outputParts.join('\n\n'),
      error,
    };
  } catch (error) {
    console.error(`Failed to parse session ${sessionId} for ${agentName}:`, error);
    return null;
  }
}

/**
 * Get all sessions from the filesystem.
 * Matches sessions to tasks by reading kanban store and finding recent session files.
 */
export async function getAllSessions(taskIdFilter?: string): Promise<SessionTranscript[]> {
  const sessions: SessionTranscript[] = [];

  // Get tasks from kanban to find session keys
  let taskSessionKeys: Array<{ taskId: string; sessionKey: string; title: string; run?: any }> = [];
  try {
    const readRaw = async () => {
      const fs = await import('fs');
      const dataDir = '/root/nerve/server-dist/data/kanban';
      const filePath = `${dataDir}/tasks.json`;
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as { tasks: Array<any> };
    };
    const data = await readRaw();
    taskSessionKeys = (data.tasks || []).map((t: any) => ({
      taskId: t.id,
      sessionKey: t.run?.sessionKey,
      title: t.title || '',
      run: t.run,
    })).filter((t: any) => t.sessionKey);
  } catch (err) {
    console.error('Failed to load tasks for session matching:', err);
  }

  const agentDirs = listAgentDirs();

  for (const agentName of agentDirs) {
    const sessionFiles = listAgentSessions(agentName);

    // Only check recent sessions (last 2 hours)
    const recentSessionFiles = sessionFiles.filter(sf => Date.now() - sf.mtime < 2 * 60 * 60 * 1000);

    for (const sessionFile of recentSessionFiles) {
      const sessionId = sessionFile.file.replace('.jsonl', '');
      const filePath = path.join(OPENCLAW_AGENTS_DIR, agentName, 'sessions', sessionFile.file);
      const mtime = sessionFile.mtime;

      const transcript = parseSessionTranscript(agentName, sessionId, filePath);

      if (transcript) {
        // Try to match to a task by timestamp from session key
        const matchedTask = taskSessionKeys.find(t => {
          // Match by timestamp suffix (e.g., kb-task-name-1774049883912)
          const tsMatch = t.sessionKey.match(/-(\d{13})$/);
          if (tsMatch) {
            const ts = parseInt(tsMatch[1], 10);
            // Match if within 60 seconds (generous window)
            return Math.abs(ts - transcript.createdAt) < 60000;
          }
          return false;
        });

        if (matchedTask) {
          transcript.taskId = matchedTask.taskId;
          transcript.label = `orch-${matchedTask.taskId}-${agentName}`;
        }

        // Filter by task ID if provided
        if (taskIdFilter && transcript.taskId !== taskIdFilter) {
          continue;
        }

        // Only include sessions that matched a task OR have orchestrator-like label
        if (transcript.taskId || transcript.label?.startsWith('orch-')) {
          sessions.push(transcript);
        }
      }
    }
  }

  // Sort by updatedAt descending (most recent first)
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get sessions for a specific task.
 */
export async function getSessionsForTask(taskId: string): Promise<SessionTranscript[]> {
  return getAllSessions(taskId);
}

/**
 * Get recent sessions (within the last N minutes).
 */
export async function getRecentSessions(minutes: number = 60): Promise<SessionTranscript[]> {
  const cutoff = Date.now() - (minutes * 60 * 1000);
  const allSessions = await getAllSessions();
  return allSessions.filter(s => s.updatedAt >= cutoff);
}
