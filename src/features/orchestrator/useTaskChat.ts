/**
 * useTaskChat - Hook for interactive chat with orchestrator task agents
 *
 * Manages real-time communication with agent sessions for a specific task.
 * Subscribes to gateway events, builds message list, and provides send/abort functions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGateway } from '@/contexts/GatewayContext';
import type { GatewayEvent, ChatEventPayload, AgentEventPayload, AgentToolStreamData } from '@/types';

export interface TaskChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agentName?: string;
  sessionKey?: string;
  content: string;
  timestamp: number;
  streaming?: boolean;
  toolUse?: Array<{ name: string; input?: string }>;
}

export interface TaskAgentSession {
  sessionKey: string;
  agentName: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
}

interface UseTaskChatResult {
  messages: TaskChatMessage[];
  sessions: TaskAgentSession[];
  loading: boolean;
  sendMessage: (agentName: string, text: string) => Promise<void>;
  abortAgent: (agentName: string) => Promise<void>;
  loadHistory: () => Promise<void>;
}

/**
 * Parse agent name from session key or label
 * Session key format: orch-{taskId}-{agentName} or orch-{taskId}-{agentName}:subagent:{label}
 */
function parseAgentName(sessionKey: string, label?: string): string {
  const source = label || sessionKey;
  // Match pattern: orch-{taskId}-{agentName}
  const match = source.match(/orch-[^-]+-([^-]+)/);
  return match ? match[1] : source;
}

/**
 * Check if a session key belongs to a specific task
 */
function isTaskSession(sessionKey: string, taskId: string): boolean {
  return sessionKey.startsWith(`orch-${taskId}-`) ||
         sessionKey.startsWith(`agent:orch-${taskId}-`);
}

export function useTaskChat(taskId: string): UseTaskChatResult {
  const { rpc, subscribe, connectionState } = useGateway();
  const [messages, setMessages] = useState<TaskChatMessage[]>([]);
  const [sessions, setSessions] = useState<TaskAgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const messageIndexRef = useRef<Map<string, TaskChatMessage>>(new Map());
  const streamingMessagesRef = useRef<Map<string, TaskChatMessage>>(new Map());

  // Fetch task sessions on mount
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/orchestrator/task/${taskId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        const taskSessions: TaskAgentSession[] = (data.sessions || []).map((s: any) => ({
          sessionKey: s.sessionKey,
          agentName: parseAgentName(s.sessionKey, s.label),
          label: s.label || s.sessionKey,
          status: s.status === 'running' ? 'running' : s.status === 'failed' ? 'failed' : 'idle',
        }));
        setSessions(taskSessions);
      }
    } catch (error) {
      console.error('Failed to load task sessions:', error);
    }
  }, [taskId]);

  // Load chat history for a specific session
  const loadHistory = useCallback(async () => {
    setLoading(true);
    const loadedMessages: TaskChatMessage[] = [];

    // Load history for each session
    for (const session of sessions) {
      try {
        const history = await rpc('chat.history', {
          sessionKey: session.sessionKey,
          limit: 50
        }) as { messages?: Array<{ role: string; content: string; timestamp?: number }> };

        if (history?.messages) {
          for (const msg of history.messages) {
            const message: TaskChatMessage = {
              id: `${session.sessionKey}-${loadedMessages.length}`,
              role: msg.role === 'user' ? 'user' : 'assistant',
              agentName: session.agentName,
              sessionKey: session.sessionKey,
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
              timestamp: msg.timestamp || Date.now(),
            };
            loadedMessages.push(message);
            messageIndexRef.current.set(message.id, message);
          }
        }
      } catch (error) {
        // History load failed for this session - continue with others
        console.debug(`Failed to load history for ${session.sessionKey}:`, error);
      }
    }

    // Sort by timestamp and set
    loadedMessages.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(loadedMessages);
    setLoading(false);
  }, [sessions, rpc]);

  // Send message to a specific agent session
  const sendMessage = useCallback(async (agentName: string, text: string) => {
    const session = sessions.find(s => s.agentName === agentName);
    if (!session) {
      console.error(`Agent ${agentName} not found`);
      return;
    }

    // Add user message to local state
    const userMessage: TaskChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      agentName,
      sessionKey: session.sessionKey,
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    messageIndexRef.current.set(userMessage.id, userMessage);

    // Send via RPC
    try {
      await rpc('chat.send', {
        sessionKey: session.sessionKey,
        message: text,
        deliver: false,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark message as failed
      userMessage.streaming = false;
      setMessages(prev => prev.map(m =>
        m.id === userMessage.id ? { ...m, streaming: false } : m
      ));
    }
  }, [sessions, rpc]);

  // Abort a running agent session
  const abortAgent = useCallback(async (agentName: string) => {
    const session = sessions.find(s => s.agentName === agentName && s.status === 'running');
    if (!session) {
      console.error(`Running agent ${agentName} not found`);
      return;
    }

    try {
      await rpc('chat.abort', { sessionKey: session.sessionKey });
      // Update session status
      setSessions(prev => prev.map(s =>
        s.agentName === agentName ? { ...s, status: 'idle' } : s
      ));
    } catch (error) {
      console.error('Failed to abort agent:', error);
    }
  }, [sessions, rpc]);

  // Subscribe to gateway events for this task
  useEffect(() => {
    if (connectionState !== 'connected') return;

    const unsubscribe = subscribe((event: GatewayEvent) => {
      // Filter events for this task's sessions
      const payload = event.payload as ChatEventPayload | AgentEventPayload | undefined;
      if (!payload?.sessionKey) return;

      if (!isTaskSession(payload.sessionKey, taskId)) {
        return;
      }

      const agentName = parseAgentName(payload.sessionKey);

      // Handle chat events (streaming responses)
      if (event.event === 'chat') {
        const chatPayload = payload as ChatEventPayload;
        const state = chatPayload.state;

        if (state === 'started' || state === 'delta') {
          // Streaming content - update or create streaming message
          const content = chatPayload.content?.[0]?.text || '';
          if (content) {
            let streamingMsg = streamingMessagesRef.current.get(agentName);
            if (!streamingMsg) {
              streamingMsg = {
                id: `stream-${agentName}-${Date.now()}`,
                role: 'assistant',
                agentName,
                sessionKey: payload.sessionKey,
                content: '',
                timestamp: Date.now(),
                streaming: true,
              };
              streamingMessagesRef.current.set(agentName, streamingMsg);
            }
            streamingMsg.content += content;
            streamingMsg.timestamp = Date.now();

            // Update display
            setMessages(prev => {
              const existing = prev.find(m => m.id === streamingMsg!.id);
              if (existing) {
                return prev.map(m => m.id === streamingMsg!.id ? { ...streamingMsg! } : m);
              }
              return [...prev, { ...streamingMsg! }];
            });
          }
        } else if (state === 'final' || state === 'error') {
          // Streaming complete - finalize message
          const streamingMsg = streamingMessagesRef.current.get(agentName);
          if (streamingMsg) {
            streamingMsg.streaming = false;
            messageIndexRef.current.set(streamingMsg.id, streamingMsg);
            streamingMessagesRef.current.delete(agentName);
          }
        }
      }

      // Handle agent events (tool usage, lifecycle)
      if (event.event === 'agent') {
        const agentPayload = payload as AgentEventPayload;

        // Track agent status changes via agentState or state
        const agentStatus = agentPayload.agentState || agentPayload.state;
        if (agentStatus) {
          const status = agentStatus.toLowerCase();
          setSessions(prev => prev.map(s => {
            if (s.sessionKey === payload.sessionKey) {
              return {
                ...s,
                status: status === 'running' || status === 'thinking' || status === 'tool_use'
                  ? 'running'
                  : status === 'done' || status === 'completed' || status === 'idle'
                    ? 'idle'
                    : status === 'error'
                      ? 'failed'
                      : s.status,
              };
            }
            return s;
          }));
        }

        // Tool usage - check data property for tool stream
        if (agentPayload.stream === 'tool' && agentPayload.data) {
          const toolData = agentPayload.data as AgentToolStreamData;
          if (toolData.phase === 'start' && toolData.name) {
            console.debug(`Agent ${agentName} using tool: ${toolData.name}`);
          }
        }
      }
    });

    return unsubscribe;
  }, [subscribe, connectionState, taskId]);

  // Initial load
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load history after sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && connectionState === 'connected') {
      loadHistory();
    }
  }, [sessions, connectionState, loadHistory]);

  return {
    messages,
    sessions,
    loading,
    sendMessage,
    abortAgent,
    loadHistory,
  };
}
