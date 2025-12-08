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

export interface ExternalLogEntry {
  id: number;
  content: string;
  timestamp: string | null;
  created_at: string;
}

const playerNameSchema = z.string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid characters');

// Parser for external database single-line format
// Format: 05/12/2025 23:11:04 - :dagger: *kikito* matou :skull: *MisticoDL* no mapa :map: *PvP Square* - *[Server: Boss Event PvP]*
export const parseExternalDbContent = (logs: ExternalLogEntry[]): ParseResult => {
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;

  // Support both single (*name*) and double (**name**) asterisk formats
  const validMapPattern = /\*{1,2}PvP Square\*{1,2}\s*-\s*\*{1,2}\[Server: Boss Event PvP\]\*{1,2}/i;
  const killPattern = /:dagger:\s*\*{1,2}(\w+)\*{1,2}\s*matou\s*:skull:\s*\*{1,2}(\w+)\*{1,2}/i;
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // Only process kills from valid PvP map
    if (!validMapPattern.test(content)) {
      continue;
    }

    // Extract date for boss label from first valid entry
    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const hour = parseInt(dateMatch[4]);
        bossLabel = `boss ${day}/${month} ${hour} horas`;
      }
    }

    // Extract killer and victim
    const killMatch = content.match(killPattern);
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
        console.warn('Invalid player name in external log, skipping');
      }
    }
  }

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs };
};

export const parseTxtFile = (content: string): ParseResult => {
  const MAX_LINES = 10000;
  const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB

  if (content.length === 0) {
    throw new Error('Arquivo vazio');
  }

  if (content.length > MAX_CONTENT_SIZE) {
    throw new Error('Conteúdo muito grande');
  }

  const lines = content.split('\n').slice(0, MAX_LINES);
  
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;

  // New multi-line format parsing
  // Format:
  // Line 1: 06/12/2025 23:11:14 - :dagger:
  // Line 2:  MAGOO1 matou :skull:
  // Line 3:  Hakumen no mapa :map:
  // Line 4:  PvP Square - [Server: Boss Event PvP]
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for date/time line with :dagger:
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*:dagger:$/);
    
    if (dateMatch) {
      // Extract boss label from first valid entry
      if (!bossLabel) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const hour = parseInt(dateMatch[4]);
        bossLabel = `boss ${day}/${month} ${hour} horas`;
      }
      
      // Check if we have the next 3 lines
      if (i + 3 < lines.length) {
        const killerLine = lines[i + 1].trim();
        const victimLine = lines[i + 2].trim();
        const mapLine = lines[i + 3].trim();
        
        // Parse killer: "MAGOO1 matou :skull:"
        const killerMatch = killerLine.match(/^(\w+)\s+matou\s+:skull:$/i);
        
        // Parse victim: "Hakumen no mapa :map:"
        const victimMatch = victimLine.match(/^(\w+)\s+no mapa\s+:map:$/i);
        
        // Check map: "PvP Square - [Server: Boss Event PvP]"
        const isValidMap = mapLine === 'PvP Square - [Server: Boss Event PvP]';
        
        if (killerMatch && victimMatch && isValidMap) {
          try {
            const killer = playerNameSchema.parse(killerMatch[1].trim());
            const victim = playerNameSchema.parse(victimMatch[1].trim());

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
            console.warn('Invalid player name, skipping');
          }
        }
        
        // Skip the processed lines
        i += 3;
      }
    }
  }

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs };
};
