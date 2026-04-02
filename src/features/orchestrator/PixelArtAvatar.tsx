/**
 * Pixel Art Agent Avatar
 *
 * 32x32 pixel art style agent avatars with status indicators.
 */

export type AgentType = 'orchestrator-agent' | 'security-reviewer' | 'planner' | 'coder' | 'tester' | 'custom';

export interface PixelArtAvatarProps {
  agentType: AgentType;
  status?: 'idle' | 'working' | 'blocked' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const AGENT_COLORS: Record<AgentType, string> = {
  'orchestrator-agent': '#3b82f6',
  'security-reviewer': '#ef4444',
  'planner': '#8b5cf6',
  'coder': '#22c55e',
  'tester': '#f59e0b',
  'custom': '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  idle: '#10b981',
  working: '#3b82f6',
  blocked: '#ef4444',
  offline: '#6b7280',
};

const SIZE_MAP: Record<'sm' | 'md' | 'lg', number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

/**
 * Generate pixel art sprite for agent type.
 * Returns array of pixel coordinates and colors.
 */
function getAgentSprite(agentType: AgentType, size: number): Array<{ x: number; y: number; color: string }> {
  const baseColor = AGENT_COLORS[agentType];
  const pixels: Array<{ x: number; y: number; color: string }> = [];

  // Simple 8x8 pixel sprite scaled up
  const spriteScale = size / 8;

  // Body (4x6 pixels in center)
  for (let y = 2; y < 6; y++) {
    for (let x = 2; x < 6; x++) {
      pixels.push({
        x: x * spriteScale,
        y: y * spriteScale,
        color: baseColor,
      });
    }
  }

  // Eyes (2 pixels)
  const eyeColor = '#ffffff';
  pixels.push({ x: 2.5 * spriteScale, y: 3 * spriteScale, color: eyeColor });
  pixels.push({ x: 4.5 * spriteScale, y: 3 * spriteScale, color: eyeColor });

  // Antenna based on agent type
  const antennaColor = agentType === 'security-reviewer' ? '#ef4444' : '#fbbf24';
  pixels.push({ x: 3.5 * spriteScale, y: 1 * spriteScale, color: antennaColor });
  pixels.push({ x: 3.5 * spriteScale, y: 0.5 * spriteScale, color: antennaColor });

  return pixels;
}

export function PixelArtAvatar({
  agentType,
  status = 'idle',
  size = 'md',
  animated = true,
}: PixelArtAvatarProps) {
  const pixelSize = SIZE_MAP[size];
  const sprite = getAgentSprite(agentType, pixelSize);

  return (
    <div
      className="relative inline-block"
      style={{ width: pixelSize * 1.5, height: pixelSize * 1.5 }}
    >
      {/* Pixel art canvas */}
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox={`0 0 ${pixelSize} ${pixelSize}`}
        className={animated && status === 'working' ? 'animate-pulse' : ''}
        style={{ imageRendering: 'pixelated' }}
      >
        {sprite.map((pixel, i) => (
          <rect
            key={i}
            x={Math.round(pixel.x)}
            y={Math.round(pixel.y)}
            width={Math.max(1, pixelSize / 8)}
            height={Math.max(1, pixelSize / 8)}
            fill={pixel.color}
          />
        ))}
      </svg>

      {/* Status indicator */}
      <div
        className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
        style={{ backgroundColor: STATUS_COLORS[status] }}
        title={`Status: ${status}`}
      />
    </div>
  );
}

/**
 * Animated sparkles for working agents.
 */
export function WorkingSparkles({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="sparkle sparkle-1" />
      <div className="sparkle sparkle-2" />
      <div className="sparkle sparkle-3" />
    </div>
  );
}
