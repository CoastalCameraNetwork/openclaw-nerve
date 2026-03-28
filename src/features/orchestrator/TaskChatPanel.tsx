/**
 * TaskChatPanel - Interactive chat panel for orchestrator task agents
 *
 * Displays messages from all agents working on a task and allows
 * sending messages to specific agents.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle, StopCircle, User, Bot } from 'lucide-react';
import { useTaskChat, type TaskAgentSession } from './useTaskChat';

interface TaskChatPanelProps {
  taskId: string;
}

export function TaskChatPanel({ taskId }: TaskChatPanelProps) {
  const { messages, sessions, loading, sendMessage, abortAgent } = useTaskChat(taskId);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select first running agent, or first agent
  useEffect(() => {
    if (sessions.length > 0 && !selectedAgent) {
      const runningAgent = sessions.find(s => s.status === 'running');
      setSelectedAgent(runningAgent?.agentName || sessions[0]?.agentName || '');
    }
  }, [sessions, selectedAgent]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !selectedAgent || sending) return;

    setSending(true);
    try {
      await sendMessage(selectedAgent, inputText.trim());
      setInputText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputText, selectedAgent, sending, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleAbort = useCallback(async (agentName: string) => {
    if (!confirm(`Abort agent ${agentName}? This will stop the running session.`)) return;
    await abortAgent(agentName);
  }, [abortAgent]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: TaskAgentSession['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'idle':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const runningAgents = sessions.filter(s => s.status === 'running');
  const selectedAgentSession = sessions.find(s => s.agentName === selectedAgent);

  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading chat...</span>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          No agent sessions found for this task. Agents will appear here when the task is executed.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden flex flex-col max-h-[500px]">
      {/* Header - Agent Selector */}
      <div className="shrink-0 p-3 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Chat with:</span>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="text-xs px-2 py-1 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {sessions.map((session) => (
                <option key={session.sessionKey} value={session.agentName}>
                  {session.agentName} ({session.status})
                </option>
              ))}
            </select>
          </div>
          {selectedAgentSession?.status === 'running' && (
            <button
              onClick={() => handleAbort(selectedAgent)}
              className="text-xs px-2 py-1 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors inline-flex items-center gap-1"
              title="Abort running agent"
            >
              <StopCircle size={12} />
              Abort
            </button>
          )}
        </div>

        {/* Agent Status Badges */}
        <div className="flex flex-wrap gap-2 mt-2">
          {sessions.map((session) => (
            <button
              key={session.sessionKey}
              onClick={() => setSelectedAgent(session.agentName)}
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors ${
                session.agentName === selectedAgent
                  ? 'bg-primary text-primary-foreground border-primary'
                  : getStatusColor(session.status)
              }`}
            >
              {session.agentName}
            </button>
          ))}
          {runningAgents.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 inline-flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              {runningAgents.length} running
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-background">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Bot size={32} className="mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Send a message to start chatting with {selectedAgent}.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isUser ? <User size={16} /> : <Bot size={16} />}
                </div>

                {/* Message Bubble */}
                <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block px-3 py-2 rounded-lg ${
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : message.streaming
                        ? 'bg-muted/50 border border-dashed'
                        : 'bg-muted'
                  }`}>
                    {/* Agent name header for assistant messages */}
                    {!isUser && message.agentName && (
                      <div className="text-[10px] font-semibold mb-1 opacity-70">
                        {message.agentName}
                      </div>
                    )}

                    {/* Message content */}
                    <div className="text-xs whitespace-pre-wrap break-words">
                      {message.content}
                      {message.streaming && (
                        <Loader2 size={10} className="animate-spin inline ml-1" />
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className={`text-[10px] text-muted-foreground mt-1 ${isUser ? 'mr-2' : 'ml-2'}`}>
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-3 border-t bg-background">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${selectedAgent || 'an agent'}... (Press Enter to send, Shift+Enter for new line)`}
            className="flex-1 min-h-[60px] max-h-[150px] text-xs px-3 py-2 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            disabled={sending || !selectedAgent}
          />
          <button
            onClick={handleSend}
            disabled={sending || !inputText.trim() || !selectedAgent}
            className="shrink-0 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        {/* Running agents notice */}
        {runningAgents.length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <AlertCircle size={10} />
            {runningAgents.length} agent(s) still running. Messages will be delivered when agent is ready.
          </div>
        )}
      </div>
    </div>
  );
}
