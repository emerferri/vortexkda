import { PlayerStats } from '@/components/Scoreboard';
import { z } from 'zod';

export interface KillLog {
  killer: string;
  victim: string;
}

export interface ParseResult {
  players: PlayerStats[];
  bossLabel: string | null;
  killLogs: KillLog[];
}

const playerNameSchema = z.string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid characters');

export const parseTxtFile = (content: string): ParseResult => {
  const MAX_LINES = 10000;
  const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

  if (content.length === 0) {
    throw new Error('Arquivo vazio');
  }

  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error('Conteúdo muito grande');
  }

  const lines = content.split('\n')
    .filter(line => line.trim())
    .slice(0, MAX_LINES);
  
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;

  lines.forEach(line => {
    // Extract date/time from line (format: 08/10/2025 22:00:26)
    const dateMatch = line.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    
    if (dateMatch && !bossLabel) {
      const day = dateMatch[1];
      const month = dateMatch[2];
      const hour = parseInt(dateMatch[4]);
      
      bossLabel = `boss ${day}/${month} ${hour} horas`;
    }

    // Only consider kills in PvP Square map
    if (!line.includes(':map: PvP Square - [Server: Boss Event PvP]')) {
      return; // Skip this line if not in PvP Square
    }

    // Pattern: :dagger: KillerName matou :skull: VictimName
    const killMatch = line.match(/:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)/i);
    
    if (killMatch) {
      try {
        const killer = playerNameSchema.parse(killMatch[1].trim());
        const victim = playerNameSchema.parse(killMatch[2].trim());

        // Add to kill logs
        killLogs.push({ killer, victim });

        // Update killer stats
        const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
        killerStats.kills += 1;
        playerMap.set(killer, killerStats);

        // Update victim stats
        const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
        victimStats.deaths += 1;
        playerMap.set(victim, victimStats);
      } catch {
        // Skip invalid player names
        console.warn('Invalid player name, skipping');
      }
    }
  });

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs };
};
