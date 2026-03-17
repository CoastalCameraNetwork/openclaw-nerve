import { sanitizeHtml } from '@/lib/sanitize';
import { formatElapsed } from '../utils';

interface StreamingMessageProps {
  html: string;
  elapsedMs: number;
  agentName?: string;
}

/**
 * Streaming message display with live content
 */
export function StreamingMessage({ html, elapsedMs, agentName = 'Agent' }: StreamingMessageProps) {
  return (
    <div className="msg msg-assistant streaming relative max-w-full break-words bg-message-assistant">
      <div className="flex items-center px-4 py-1.5 gap-2">
        <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-sm bg-green/20 text-green">{agentName.toUpperCase()}</span>
        {elapsedMs > 0 && (
          <span className="text-muted-foreground text-[10px] font-mono ml-auto tabular-nums">{formatElapsed(elapsedMs)}</span>
        )}
      </div>
      <div className="px-4 pb-2 pl-10 border-l-2 border-green ml-4">
        <div
          className="msg-body whitespace-pre-wrap text-foreground text-[13px]"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      </div>
    </div>
  );
}
