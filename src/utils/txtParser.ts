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
// Supports multiple formats:
// 1. With asterisks: 05/12/2025 23:11:04 - :dagger: *kikito* matou :skull: *MisticoDL* no mapa :map: *PvP Square* - *[Server: Boss Event PvP]*
// 2. Without asterisks: 07/12/2025 20:01:02 - :dagger: Freezing matou :skull: HulkSmash no mapa :map: PvP Square - [Server: Boss Event PvP]
export const parseExternalDbContent = (logs: ExternalLogEntry[]): ParseResult => {
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;
  let matchedEntries = 0;

  console.log(`[External DB Parser] Processing ${logs.length} logs`);

  // Pattern with asterisks: *name* or **name**
  const killPatternWithAsterisks = /:dagger:\s*\*{1,2}(\w+)\*{1,2}\s*matou\s*:skull:\s*\*{1,2}(\w+)\*{1,2}/i;
  const mapPatternWithAsterisks = /\*{1,2}PvP Square\*{1,2}\s*-\s*\*{1,2}\[Server: Boss Event PvP\]\*{1,2}/i;
  
  // Pattern without asterisks
  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /PvP Square\s*-\s*\[Server: Boss Event PvP\]/i;
  
  const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // Check if it's a valid PvP map (either format)
    const hasValidMapWithAsterisks = mapPatternWithAsterisks.test(content);
    const hasValidMapNoAsterisks = mapPatternNoAsterisks.test(content);
    
    if (!hasValidMapWithAsterisks && !hasValidMapNoAsterisks) {
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

    // Try to extract killer and victim (try both patterns)
    let killMatch = content.match(killPatternWithAsterisks);
    if (!killMatch) {
      killMatch = content.match(killPatternNoAsterisks);
    }
    
    if (killMatch) {
      try {
        const killer = playerNameSchema.parse(killMatch[1].trim());
        const victim = playerNameSchema.parse(killMatch[2].trim());

        // Add to kill logs
        killLogs.push({ killer, victim });
        matchedEntries++;

        // Update killer stats
        const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
        killerStats.kills += 1;
        playerMap.set(killer, killerStats);

        // Update victim stats
        const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
        victimStats.deaths += 1;
        playerMap.set(victim, victimStats);
      } catch {
        console.warn('[External DB Parser] Invalid player name, skipping');
      }
    }
  }

  console.log(`[External DB Parser] Matched entries: ${matchedEntries}, Players: ${playerMap.size}`);

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
  console.log(`[TXT Parser] Total lines: ${lines.length}`);
  
  const playerMap = new Map<string, { kills: number; deaths: number }>();
  const killLogs: KillLog[] = [];
  let bossLabel: string | null = null;
  let matchedEntries = 0;

  // Single-line format (most common):
  // 07/12/2025 20:01:02 - :dagger: Freezing matou :skull: HulkSmash no mapa :map: PvP Square - [Server: Boss Event PvP]
  const singleLinePattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa\s+:map:\s*(.+)$/i;
  const validMapSingleLine = /^PvP Square\s*-\s*\[Server: Boss Event PvP\]$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try single-line format first
    const singleMatch = line.match(singleLinePattern);
    if (singleMatch) {
      const day = singleMatch[1];
      const month = singleMatch[2];
      const hour = parseInt(singleMatch[4]);
      const killer = singleMatch[7];
      const victim = singleMatch[8];
      const mapPart = singleMatch[9].trim();

      // Extract boss label from first valid entry
      if (!bossLabel) {
        bossLabel = `boss ${day}/${month} ${hour} horas`;
      }

      // Validate map
      if (validMapSingleLine.test(mapPart)) {
        matchedEntries++;
        try {
          const validKiller = playerNameSchema.parse(killer.trim());
          const validVictim = playerNameSchema.parse(victim.trim());

          // Add to kill logs
          killLogs.push({ killer: validKiller, victim: validVictim });

          // Update killer stats
          const killerStats = playerMap.get(validKiller) || { kills: 0, deaths: 0 };
          killerStats.kills += 1;
          playerMap.set(validKiller, killerStats);

          // Update victim stats
          const victimStats = playerMap.get(validVictim) || { kills: 0, deaths: 0 };
          victimStats.deaths += 1;
          playerMap.set(validVictim, victimStats);
        } catch {
          console.warn('[TXT Parser] Invalid player name, skipping');
        }
      } else {
        console.log(`[TXT Parser] Skipped (wrong map): "${mapPart}"`);
      }
      continue;
    }

    // Fallback: Multi-line format
    // Line 1: 06/12/2025 23:11:14 - :dagger:
    // Line 2: MAGOO1 matou :skull:
    // Line 3: Hakumen no mapa :map:
    // Line 4: PvP Square - [Server: Boss Event PvP]
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*-\s*:dagger:$/);
    
    if (dateMatch) {
      if (!bossLabel) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        const hour = parseInt(dateMatch[4]);
        bossLabel = `boss ${day}/${month} ${hour} horas`;
      }
      
      if (i + 3 < lines.length) {
        const killerLine = lines[i + 1].trim();
        const victimLine = lines[i + 2].trim();
        const mapLine = lines[i + 3].trim();
        
        const killerMatch = killerLine.match(/^(\w+)\s+matou\s+:skull:$/i);
        const victimMatch = victimLine.match(/^(\w+)\s+no mapa\s+:map:$/i);
        const isValidMap = mapLine === 'PvP Square - [Server: Boss Event PvP]';
        
        if (killerMatch && victimMatch && isValidMap) {
          matchedEntries++;
          try {
            const killer = playerNameSchema.parse(killerMatch[1].trim());
            const victim = playerNameSchema.parse(victimMatch[1].trim());

            killLogs.push({ killer, victim });

            const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
            killerStats.kills += 1;
            playerMap.set(killer, killerStats);

            const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
            victimStats.deaths += 1;
            playerMap.set(victim, victimStats);
          } catch {
            console.warn('[TXT Parser] Invalid player name, skipping');
          }
        }
        i += 3;
      }
    }
  }

  console.log(`[TXT Parser] Matched entries from Boss Event PvP: ${matchedEntries}`);

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return { players, bossLabel, killLogs };
};
