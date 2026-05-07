import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalLogEntry {
  id: string;
  content: string;
  timestamp: string;
  created_at: string;
}

interface PlayerStats {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
}

interface KillLog {
  killer: string;
  victim: string;
}

interface ParseResult {
  players: Record<string, PlayerStats>;
  bossLabel: string;
  killLogs: KillLog[];
}

interface GuildStats {
  playerCount: number;
  kills: number;
  deaths: number;
}

interface RequestBody {
  trigger?: string;
  attempt?: number;        // 1, 2, or 3
  forceProcess?: boolean;  // true on 3rd attempt
  eventHour?: number;      // boss hour (20, 21, 22)
  eventMinute?: number;    // boss minute (0 or 30)
  eventType?: 'boss_event' | 'throne_conquest'; // Type of event
}

// Format ranking as monospaced table for Discord
function formatRankingTable(players: Array<{name: string, kills: number, deaths: number, kda: number, eventScore: number, class_short?: string}>): string {
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  const hasClassShort = players.some(p => p.class_short && p.class_short.trim() !== '');
  const classColWidth = 5;
  
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(hasClassShort ? 57 : 52) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + (hasClassShort ? 'Sigla' + ' ' : '') + '  K    D    KDA     Score\n';
  table += '─'.repeat(hasClassShort ? 57 : 52) + '\n';
  
  players.forEach((player, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const nameStr = player.name.padEnd(maxNameLen + 2);
    const classStr = hasClassShort ? (player.class_short || '').padEnd(classColWidth + 1) : '';
    const killsStr = player.kills.toString().padStart(3);
    const deathsStr = player.deaths.toString().padStart(4);
    const kdaStr = player.kda.toFixed(2).padStart(7);
    const scoreStr = player.eventScore.toFixed(2).padStart(9);
    
    table += `${posStr} ${nameStr}${classStr}${killsStr}${deathsStr}${kdaStr}${scoreStr}\n`;
  });
  
  return table;
}

// Format guild ranking as monospaced table for Discord
function formatGuildRankingTable(guilds: Array<{
  guild: string;
  playerCount: number;
  kills: number;
  deaths: number;
  score: number;
}>): string {
  const maxGuildLen = Math.max(5, ...guilds.map(g => g.guild.length));
  
  let table = '⚔️ RANKING POR GUILD\n';
  table += '═'.repeat(55) + '\n\n';
  table += ' Pos  ' + 'Guild'.padEnd(maxGuildLen + 2) + 'Jogadores    K     D    Score\n';
  table += '─'.repeat(55) + '\n';
  
  guilds.forEach((guild, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const guildStr = guild.guild.padEnd(maxGuildLen + 2);
    const playersStr = guild.playerCount.toString().padStart(9);
    const killsStr = guild.kills.toString().padStart(5);
    const deathsStr = guild.deaths.toString().padStart(5);
    const scoreStr = guild.score.toFixed(2).padStart(9);
    
    table += `${posStr} ${guildStr}${playersStr}${killsStr}${deathsStr}${scoreStr}\n`;
  });
  
  return table;
}

// Format Fogo Amigo ranking as monospaced table
function formatFogoAmigoTableLocal(entries: Array<{name: string; class_short?: string; friendly_kills: number; friendly_deaths: number; kda: number; eventScore: number}>): string {
  if (!entries || entries.length === 0) return 'Nenhum caso de fogo amigo encontrado';
  const maxNameLen = Math.max(7, ...entries.map(e => e.name.length));
  const hasClass = entries.some(e => e.class_short && e.class_short.trim() !== '');
  const classW = 5;
  const width = maxNameLen + (hasClass ? classW + 1 : 0) + 32;

  let table = '🔥 RANKING FOGO AMIGO\n';
  table += '═'.repeat(width) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + (hasClass ? 'Sigla ' : '') + '  K    D    KDA     Score\n';
  table += '─'.repeat(width) + '\n';

  entries.forEach((p, index) => {
    const pos = index + 1;
    let posStr: string;
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;

    const nameStr = p.name.padEnd(maxNameLen + 2);
    const classStr = hasClass ? (p.class_short || '').padEnd(classW + 1) : '';
    const killsStr = p.friendly_kills.toString().padStart(3);
    const deathsStr = p.friendly_deaths.toString().padStart(4);
    const kdaStr = Number(p.kda).toFixed(2).padStart(7);
    const scoreStr = Number(p.eventScore).toFixed(2).padStart(9);

    table += `${posStr} ${nameStr}${classStr}${killsStr}${deathsStr}${kdaStr}${scoreStr}\n`;
  });

  return table;
}

// Parser logic for Boss Event (PvP Square map)
function parseExternalDbContentBoss(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser Boss] Processing ${logs.length} logs`);

  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*\*/i;

  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*PvP Square\*\s*-\s*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*/i;

  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /PvP Square\s*-\s*\[Server: (?:Boss Event PvP|Platinum PvP)\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // STRICT: Only accept PvP Square map for Boss Events
    const hasValidMap = mapPatternDoubleAsterisks.test(content) ||
      mapPatternSingleAsterisks.test(content) ||
      mapPatternNoAsterisks.test(content);

    if (!hasValidMap) continue;

    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const [, day, month, year, hour] = dateMatch;
        bossLabel = `BOSSx2 ${day}/${month}/${year} ${hour}H`;
      }
    }

    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternSingleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternNoAsterisks);

    if (killMatch) {
      const killer = killMatch[1];
      const victim = killMatch[2];

      matchedEntries++;

      if (!players[killer]) {
        players[killer] = { name: killer, kills: 0, deaths: 0, kda: 0 };
      }
      players[killer].kills++;

      if (!players[victim]) {
        players[victim] = { name: victim, kills: 0, deaths: 0, kda: 0 };
      }
      players[victim].deaths++;

      killLogs.push({ killer, victim });
    }
  }

  for (const player of Object.values(players)) {
    player.kda = player.deaths === 0 ? player.kills : parseFloat((player.kills / player.deaths).toFixed(2));
  }

  console.log(`[Auto Parser Boss] Matched ${matchedEntries} valid entries (PvP Square), ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Parser logic for Throne Conquest (Devias map)
function parseExternalDbContentThrone(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser Throne] Processing ${logs.length} logs`);

  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i;

  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i;

  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /Devias\s*-\s*\[Server: Boss Event PvP\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // STRICT: Only accept Devias map for Throne Conquest
    const hasValidMap = mapPatternDoubleAsterisks.test(content) ||
      mapPatternSingleAsterisks.test(content) ||
      mapPatternNoAsterisks.test(content);

    if (!hasValidMap) continue;

    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const [, day, month, year, hour] = dateMatch;
        bossLabel = `Throne ${day}/${month}/${year} ${hour}H`;
      }
    }

    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternSingleAsterisks);
    if (!killMatch) killMatch = content.match(killPatternNoAsterisks);

    if (killMatch) {
      const killer = killMatch[1];
      const victim = killMatch[2];

      matchedEntries++;

      if (!players[killer]) {
        players[killer] = { name: killer, kills: 0, deaths: 0, kda: 0 };
      }
      players[killer].kills++;

      if (!players[victim]) {
        players[victim] = { name: victim, kills: 0, deaths: 0, kda: 0 };
      }
      players[victim].deaths++;

      killLogs.push({ killer, victim });
    }
  }

  for (const player of Object.values(players)) {
    player.kda = player.deaths === 0 ? player.kills : parseFloat((player.kills / player.deaths).toFixed(2));
  }

  console.log(`[Auto Parser Throne] Matched ${matchedEntries} valid entries (Devias), ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Calculate best kill streak (consecutive kills without dying) from kill logs
function calculateBestKillStreak(killLogs: KillLog[], bannedPlayers: Set<string> = new Set()): { name: string; streak: number } | null {
  if (!killLogs || killLogs.length === 0) return null;

  const playerStreaks = new Map<string, number>();
  const playerMaxStreaks = new Map<string, number>();

  for (const log of killLogs) {
    const killer = log.killer;
    const victim = log.victim;

    // Increment killer streak
    const currentStreak = (playerStreaks.get(killer) || 0) + 1;
    playerStreaks.set(killer, currentStreak);

    // Update max streak
    const globalMax = playerMaxStreaks.get(killer) || 0;
    if (currentStreak > globalMax) {
      playerMaxStreaks.set(killer, currentStreak);
    }

    // Reset victim streak
    playerStreaks.set(victim, 0);
  }

  // Find best streak among non-banned players
  let best: { name: string; streak: number } | null = null;
  for (const [name, streak] of playerMaxStreaks.entries()) {
    if (bannedPlayers.has(name)) continue;
    if (streak >= 2 && (!best || streak > best.streak)) {
      best = { name, streak };
    }
  }

  return best;
}

// Extract minute from the last log entry - filtered by map type
function getLastKillMinute(logs: ExternalLogEntry[], eventType: 'boss_event' | 'throne_conquest'): number | null {
  if (!logs || logs.length === 0) return null;
  
  // Map validation patterns based on event type
  const mapPatterns = eventType === 'throne_conquest'
    ? [
        /\*\*Devias\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i,
        /\*Devias\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i,
        /Devias\s*-\s*\[Server: Boss Event PvP\]/i,
      ]
    : [
        /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*\*/i,
        /\*PvP Square\*\s*-\s*\*\[Server: (?:Boss Event PvP|Platinum PvP)\]\*/i,
        /PvP Square\s*-\s*\[Server: (?:Boss Event PvP|Platinum PvP)\]/i,
      ];
  
  // Find the most recent log from the valid map (logs are ordered DESC)
  for (const log of logs) {
    if (!log.content) continue;
    
    const hasValidMap = mapPatterns.some(pattern => pattern.test(log.content));
    
    if (!hasValidMap) continue;
    
    // Try to extract time from timestamp field (format: YYYY-MM-DDTHH:MM:SS or similar)
    const timestampMatch = log.timestamp?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (timestampMatch) {
      return parseInt(timestampMatch[2], 10); // return minute
    }
    
    // Try from content field
    const contentMatch = log.content?.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (contentMatch) {
      return parseInt(contentMatch[2], 10);
    }
  }
  
  return null;
}

// Get minute threshold based on attempt and event configuration
function getMinuteThreshold(attempt: number, eventHour: number, eventMinute: number = 0): number {
  if (eventHour === 22 && eventMinute === 0) {
    // Boss 22:00 - checks happen at 23:00, 23:20, 23:30
    if (attempt === 1) return 59; // 23:00 checks for 22:59
    if (attempt === 2) return 19; // 23:20 checks for 23:19
  } else if (eventHour === 22 && eventMinute === 30) {
    // Boss 22:30 (Tuesday/Thursday) - checks happen at 23:00, 23:20, 23:30
    if (attempt === 1) return 29;
    if (attempt === 2) return 49;
  } else if (eventHour === 21 && eventMinute === 36) {
    // Throne Conquest 21:36 - ends at 22:36
    if (attempt === 1) return 35; // 22:40 checks for 22:35
    if (attempt === 2) return 39; // 22:45 checks for 22:39
  } else if (eventHour === 20 || eventHour === 21) {
    // Boss 20:00 or 21:00
    if (attempt === 1) return 29; // XX:30 checks for XX:29
    if (attempt === 2) return 49; // XX:50 checks for XX:49
  }
  return -1; // Attempt 3 always processes
}

// Check if event might still be active based on last kill minute
function shouldPostpone(attempt: number, forceProcess: boolean, lastKillMinute: number | null, eventHour: number, eventMinute: number = 0): boolean {
  if (forceProcess || attempt === 3) {
    return false; // Always process on force or 3rd attempt
  }
  
  if (lastKillMinute === null) {
    return false; // No logs = nothing to postpone
  }
  
  const threshold = getMinuteThreshold(attempt, eventHour, eventMinute);
  if (threshold === -1) {
    return false;
  }
  
  return lastKillMinute >= threshold;
}

function getEventTimeRange(eventHour?: number, eventMinute: number = 0, eventType: 'boss_event' | 'throne_conquest' = 'boss_event'): { startDate: string; endDate: string; matchDate: string; matchHour: number; localStartDate: string; localEndDate: string } {
  // Brazil timezone offset (UTC-3)
  const BRAZIL_OFFSET = -3;
  
  // Get current time in Brazil timezone
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brazilTime = new Date(utcTime + (BRAZIL_OFFSET * 3600000));
  
  const dayOfWeek = brazilTime.getDay();
  const currentHour = brazilTime.getHours();
  
  console.log(`[Auto Process] Brazil time: ${brazilTime.toISOString()}, day: ${dayOfWeek}, hour: ${currentHour}, eventType: ${eventType}`);

  let targetEventHour: number;
  let targetEventMinute: number = eventMinute;

  // Use provided eventHour if available, otherwise determine from current time
  if (eventHour !== undefined) {
    targetEventHour = eventHour;
  } else {
    // Determine the event hour based on day and time
    if (dayOfWeek === 1) {
      // Monday: 21:00 and 22:00
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 21) targetEventHour = 21;
      else targetEventHour = 22;
    } else if (dayOfWeek === 2 || dayOfWeek === 4) {
      // Tuesday/Thursday: 20:00 and 22:00
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 20) targetEventHour = 20;
      else targetEventHour = 22;
    } else {
      // Other days: 20:00 and 22:00
      if (currentHour >= 22) targetEventHour = 22;
      else if (currentHour >= 20) targetEventHour = 20;
      else targetEventHour = 22;
    }
  }

  // Create event date in Brazil time
  const eventDateBrazil = new Date(brazilTime);
  eventDateBrazil.setHours(targetEventHour, targetEventMinute, 0, 0);

  // Only go back a day if we haven't reached the event time yet AND no eventHour was explicitly provided
  // When eventHour is provided via cron, we trust that the event already happened today
  if (eventHour === undefined && eventDateBrazil > brazilTime) {
    eventDateBrazil.setDate(eventDateBrazil.getDate() - 1);
  }

  // Convert Brazil time back to UTC for database query
  const startDateUTC = new Date(eventDateBrazil.getTime() - (BRAZIL_OFFSET * 3600000));
  
  // Determine end time based on event type
  let endOffsetMs = 3600000; // Default +1 hour
  if (eventType === 'throne_conquest') {
    // Throne Conquest: 21:36 to 22:36 = 60 minutes + buffer
    endOffsetMs = 4500000; // +75 minutes
  } else if (targetEventHour === 22) {
    endOffsetMs = 5400000; // +1.5 hours (until 23:30) for Boss
  }
  const endDateUTC = new Date(startDateUTC.getTime() + endOffsetMs);

  // Format match date in Brazil timezone for storage
  const matchDate = `${eventDateBrazil.getFullYear()}-${String(eventDateBrazil.getMonth() + 1).padStart(2, '0')}-${String(eventDateBrazil.getDate()).padStart(2, '0')}`;

  // Format local Brazil time strings for external database query (which stores in local time)
  let localEndHour = targetEventHour;
  let localEndMinute = 59;
  
  if (eventType === 'throne_conquest') {
    // Throne: 21:36 to 22:40 (with buffer)
    localEndHour = 22;
    localEndMinute = 40;
  } else if (targetEventHour === 22 && targetEventMinute === 0) {
    localEndHour = 23;
    localEndMinute = 29;
  } else if (targetEventHour === 22 && targetEventMinute === 30) {
    localEndHour = 23;
    localEndMinute = 29;
  }
  
  const localStartDate = `${matchDate}T${String(targetEventHour).padStart(2, '0')}:${String(targetEventMinute).padStart(2, '0')}`;
  const localEndDate = `${matchDate}T${String(localEndHour).padStart(2, '0')}:${String(localEndMinute).padStart(2, '0')}`;

  console.log(`[Auto Process] Event: ${matchDate} ${targetEventHour}:${String(targetEventMinute).padStart(2, '0')} BRT (${eventType})`);
  console.log(`[Auto Process] Local query range: ${localStartDate} to ${localEndDate}`);
  console.log(`[Auto Process] UTC query range: ${startDateUTC.toISOString()} to ${endDateUTC.toISOString()}`);

  return {
    startDate: startDateUTC.toISOString(),
    endDate: endDateUTC.toISOString(),
    matchDate,
    matchHour: targetEventHour,
    localStartDate,
    localEndDate
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Core processor extracted so we can optionally run it in background.
  const processRanking = async (body: RequestBody) => {
    const attempt = body.attempt || 1;
    const forceProcess = body.forceProcess || false;
    const eventHour = body.eventHour;
    const eventMinute = body.eventMinute || 0;
    const eventType = body.eventType || 'boss_event';
    
    console.log(`[Auto Process] Starting automatic ranking processing... Attempt: ${attempt}, Force: ${forceProcess}, EventHour: ${eventHour}, EventMinute: ${eventMinute}, EventType: ${eventType}`);

    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalServiceKey);

    const { startDate, endDate, matchDate, matchHour, localStartDate, localEndDate } = getEventTimeRange(eventHour, eventMinute, eventType);
    console.log(`[Auto Process] Fetching logs for ${matchDate} ${matchHour}:${String(eventMinute).padStart(2, '0')} (${eventType})`);

    // Check if this match already exists - filter by event_type to allow same hour different event types
    const { data: existingMatch } = await internalClient
      .from('pvp_matches')
      .select('id')
      .eq('match_date', matchDate)
      .eq('match_hour', matchHour)
      .eq('event_type', eventType)
      .maybeSingle();

    if (existingMatch) {
      console.log(`[Auto Process] ${eventType} match already exists for ${matchDate} ${matchHour}:00, skipping`);
      return {
        success: true,
        status: 'already_exists',
        message: 'Match already processed',
        matchDate,
        matchHour,
        eventType,
      };
    }

    // Connect to external Supabase
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalUrl || !externalKey) {
      throw new Error('External database credentials not configured');
    }

    const externalClient = createClient(externalUrl, externalKey);

    // Query using local Brazil time (external DB stores timestamps in local time)
    // Paginate to fetch ALL logs (Supabase default limit is 1000 per request)
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10;
    let logs: ExternalLogEntry[] = [];
    let page = 0;

    while (page < MAX_PAGES) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: pageLogs, error: logsError } = await externalClient
        .from('logs_pvp')
        .select('id, content, timestamp, created_at')
        .gte('timestamp', localStartDate)
        .lte('timestamp', localEndDate)
        .order('timestamp', { ascending: false })
        .range(from, to);

      if (logsError) {
        throw new Error(`Failed to fetch logs: ${logsError.message}`);
      }

      if (!pageLogs || pageLogs.length === 0) break;

      logs = logs.concat(pageLogs as ExternalLogEntry[]);
      console.log(`[Auto Process] Page ${page + 1}: fetched ${pageLogs.length} logs (total: ${logs.length})`);

      if (pageLogs.length < PAGE_SIZE) break;
      page++;
    }

    // Deduplicate external logs by their id to prevent duplicate kill entries
    const seenLogIds = new Set<string>();
    const dedupedLogs: ExternalLogEntry[] = [];
    for (const log of logs) {
      if (!seenLogIds.has(log.id)) {
        seenLogIds.add(log.id);
        dedupedLogs.push(log);
      }
    }
    if (dedupedLogs.length < logs.length) {
      console.log(`[Auto Process] Deduplicated external logs: ${logs.length} -> ${dedupedLogs.length}`);
    }
    logs = dedupedLogs;

    console.log(`[Auto Process] Fetched ${logs.length} unique logs from external database`);

    if (!logs || logs.length === 0) {
      console.log('[Auto Process] No logs found for this time period');
      return { success: true, status: 'no_logs', message: 'No logs found', matchDate, matchHour, attempt, eventType };
    }

    // Check if we should postpone based on last kill time
    const lastKillMinute = getLastKillMinute(logs, eventType);
    console.log(`[Auto Process] Last kill minute (${eventType}): ${lastKillMinute}`);
    
    if (shouldPostpone(attempt, forceProcess, lastKillMinute, matchHour, eventMinute)) {
      const threshold = getMinuteThreshold(attempt, matchHour, eventMinute);
      console.log(`[Auto Process] Attempt ${attempt}: Last kill at minute ${lastKillMinute}, >= ${threshold}, postponing`);
      return {
        success: true,
        status: 'postponed',
        attempt,
        lastKillMinute,
        threshold,
        eventType,
        message: 'Event may still be active, waiting for next attempt',
      };
    }

    // Parse logs using the appropriate parser based on event type
    const parseResult = eventType === 'throne_conquest'
      ? parseExternalDbContentThrone(logs)
      : parseExternalDbContentBoss(logs);

    if (Object.keys(parseResult.players).length === 0) {
      console.log(`[Auto Process] No valid player data found after parsing for ${eventType}`);
      return { success: true, status: 'no_players', message: 'No valid player data', matchDate, matchHour, eventType };
    }

    const bossLabel = parseResult.bossLabel || (eventType === 'throne_conquest' 
      ? `Throne ${matchDate} ${matchHour}H`
      : `BOSSx2 ${matchDate} ${matchHour}H`);

    // Insert match with event_type
    const { data: newMatch, error: matchError } = await internalClient
      .from('pvp_matches')
      .insert({
        match_date: matchDate,
        match_hour: matchHour,
        boss_label: bossLabel,
        event_type: eventType,
      })
      .select()
      .single();

    if (matchError) {
      throw new Error(`Failed to insert match: ${matchError.message}`);
    }

    console.log(`[Auto Process] Created ${eventType} match with ID: ${newMatch.id}`);

    // Insert players
    const playerInserts = Object.values(parseResult.players).map(player => ({
      match_id: newMatch.id,
      player_name: player.name,
      kills: player.kills,
      deaths: player.deaths,
      kda: player.kda,
    }));

    const { error: playersError } = await internalClient
      .from('pvp_match_players')
      .insert(playerInserts);

    if (playersError) {
      throw new Error(`Failed to insert players: ${playersError.message}`);
    }

    // Insert kill logs
    const killLogInserts = parseResult.killLogs.map(log => ({
      match_id: newMatch.id,
      killer_name: log.killer,
      victim_name: log.victim,
    }));

    const { error: killLogsError } = await internalClient
      .from('pvp_kill_logs')
      .insert(killLogInserts);

    if (killLogsError) {
      console.error('[Auto Process] Failed to insert kill logs:', killLogsError.message);
    }

    // Fetch character data (including banned status for filtering)
    const playerNames = Object.keys(parseResult.players);
    const { data: characters } = await internalClient
      .from('characters')
      .select('name, guild, class, banned, class_short')
      .in('name', playerNames);

    const characterMap: Record<string, { guild: string; class: string; banned: boolean; class_short: string }> = {};
    if (characters) {
      for (const char of characters) {
        characterMap[char.name] = { guild: char.guild, class: char.class, banned: char.banned || false, class_short: char.class_short || '' };
      }
    }

    // Filter out banned players from rankings
    const bannedPlayerNames = new Set(
      Object.entries(characterMap)
        .filter(([_, data]) => data.banned)
        .map(([name, _]) => name),
    );

    const nonBannedPlayers = Object.values(parseResult.players)
      .filter(p => !bannedPlayerNames.has(p.name));

    // Calculate guild summary with full stats (only non-banned players)
    const guildSummary: Record<string, GuildStats> = {};
    for (const player of nonBannedPlayers) {
      const charInfo = characterMap[player.name];
      const guild = charInfo?.guild || 'Sem Guild';
      if (!guildSummary[guild]) {
        guildSummary[guild] = { playerCount: 0, kills: 0, deaths: 0 };
      }
      guildSummary[guild].playerCount++;
      guildSummary[guild].kills += player.kills;
      guildSummary[guild].deaths += player.deaths;
    }

    // Calculate guild scores and sort
    const guildsWithScore = Object.entries(guildSummary).map(([guild, stats]) => {
      const guildKDA = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;
      const score = (stats.kills * 3) + (guildKDA * 2) - (stats.deaths * 1.5);
      return { guild, ...stats, score };
    });
    const sortedGuilds = guildsWithScore.sort((a, b) => b.score - a.score);
    const guildRankingText = formatGuildRankingTable(sortedGuilds);

    // Calculate special rankings using correct eventScore formula: (kills * 3) + (kda * 2) - (deaths * 1.5)
    const playersWithEventScore = nonBannedPlayers.map(p => ({
      ...p,
      eventScore: (p.kills * 3) + (p.kda * 2) - (p.deaths * 1.5),
    }));

    // Cone Monodedo = worst eventScore (lowest)
    const sortedByEventScore = [...playersWithEventScore].sort((a, b) => a.eventScore - b.eventScore);
    const coneMonodedo = sortedByEventScore[0];

    // Rei do PVP / Rei do Trono = best eventScore (highest), excluding cone monodedo
    const eligibleForRei = playersWithEventScore.filter(p => p.name !== coneMonodedo?.name);
    const reiDoPVP = [...eligibleForRei].sort((a, b) => b.eventScore - a.eventScore)[0];

    // Brabissimo = best KDA, excluding cone monodedo
    const sortedByKDA = playersWithEventScore
      .filter(p => p.name !== coneMonodedo?.name)
      .sort((a, b) => b.kda - a.kda);
    const brabissimo = sortedByKDA[0];

    // Calculate best kill streak from killLogs
    const bestKillStreak = calculateBestKillStreak(parseResult.killLogs, bannedPlayerNames);

    const totals = {
      kills: nonBannedPlayers.reduce((sum, p) => sum + p.kills, 0),
      deaths: nonBannedPlayers.reduce((sum, p) => sum + p.deaths, 0),
      playerCount: nonBannedPlayers.length,
    };

    // Build ranking table text with correct eventScore formula - excluding banned
    const playersWithScore = nonBannedPlayers.map(player => {
      const eventScore = (player.kills * 3) + (player.kda * 2) - (player.deaths * 1.5);
      const charInfo = characterMap[player.name];
      return { ...player, eventScore, class_short: charInfo?.class_short || '' };
    });
    const sortedPlayers = playersWithScore.sort((a, b) => b.eventScore - a.eventScore);
    const rankingTableText = formatRankingTable(sortedPlayers);

    // Post to Discord - select webhook based on event type
    const isPostingPaused = Deno.env.get('AUTO_POST_PAUSED') === 'true';
    let webhookUrl: string | undefined;
    if (eventType === 'throne_conquest') {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_THRONE');
    } else {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD') || Deno.env.get('DISCORD_WEBHOOK_URL');
    }

    if (isPostingPaused) {
      console.log(`[Auto Process] ⏸️ Discord posting is PAUSED. Skipping webhook for ${eventType} (${matchDate} ${matchHour}H). Data was saved successfully.`);
    } else if (webhookUrl) {
      const [year, month, day] = matchDate.split('-');
      const formattedDate = `${day}/${month}/${year}`;

      // Dynamic titles based on event type
      const isThrone = eventType === 'throne_conquest';
      const rankingTitle = isThrone ? '📊 Ranking Throne Conquest' : '📊 Ranking BOSS Diário';
      const reiTitle = isThrone ? '👑 Rei do Trono!' : '👑 Rei do PVP';
      const embedColor = isThrone ? 0xF59E0B : 0x10B981; // Yellow for throne, green for boss
      const eventLabel = isThrone ? 'Throne Conquest' : 'Boss/evento';
      // Fetch and select phrases with rotation (no repeats until all used)
      const selectPhrase = async (category: string, name: string, value: string, fallback: string): Promise<string> => {
        try {
          // Get the least recently used phrase (NULLs first = never used)
          const { data, error } = await internalClient
            .from('discord_highlight_phrases')
            .select('id, phrase_template')
            .eq('category', category)
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .limit(1)
            .single();

          if (error || !data) {
            console.log(`[Auto Process] No phrase found for category ${category}, using fallback`);
            return fallback;
          }

          // Mark this phrase as used now
          await internalClient
            .from('discord_highlight_phrases')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id);

          console.log(`[Auto Process] Selected phrase ${data.id} for category ${category}`);
          return data.phrase_template.replace(/\{name\}/g, name).replace(/\{value\}/g, value);
        } catch (e) {
          console.log(`[Auto Process] Failed to fetch phrase for ${category}, using fallback`);
          return fallback;
        }
      };

      const footerLines: string[] = [`**Destaques ${eventLabel}:**`];
      if (bestKillStreak) {
        footerLines.push(`1 - ${await selectPhrase('kill_streak', `**${bestKillStreak.name}**`, String(bestKillStreak.streak), `**${bestKillStreak.name}** matou ${bestKillStreak.streak} vezes sem morrer! é um monstro do PVP.`)}`);
      }
      if (brabissimo) {
        footerLines.push(`2 - ${await selectPhrase('best_kda', `**${brabissimo.name}**`, brabissimo.kda.toFixed(2), `**${brabissimo.name}** esse manja de posicionamento, KDA implacável ${brabissimo.kda.toFixed(2)}`)}`);
      }
      if (coneMonodedo) {
        footerLines.push(`3 - ${await selectPhrase('cone', `**${coneMonodedo.name}**`, String(coneMonodedo.deaths), `**${coneMonodedo.name}** Esse deve estar jogando sem mouse! morreu ${coneMonodedo.deaths} vezes!`)}`);
      }
      const footerMessage = footerLines.join('\n');

      // Embed 1: Main info
      const embed1 = {
        title: rankingTitle,
        color: embedColor,
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: `A partir de: **${formattedDate}**\nHora inicial: **${matchHour}:${String(eventMinute).padStart(2, '0')}**\nOrdenação: **eventScore**`,
            inline: false,
          },
          {
            name: reiTitle,
            value: reiDoPVP ? `**${reiDoPVP.name}**\nScore: ${reiDoPVP.eventScore.toFixed(2)} • ${reiDoPVP.kills}K/${reiDoPVP.deaths}D` : 'N/A',
            inline: true,
          },
          {
            name: '⚡ Brabissimo',
            value: brabissimo ? `**${brabissimo.name}**\nKDA: ${brabissimo.kda} • ${brabissimo.kills}K/${brabissimo.deaths}D` : 'N/A',
            inline: true,
          },
          {
            name: '🍦 Cone Monodedo',
            value: coneMonodedo ? `**${coneMonodedo.name}**\nScore: ${coneMonodedo.eventScore.toFixed(2)} • ${coneMonodedo.kills}K/${coneMonodedo.deaths}D` : 'N/A',
            inline: true,
          },
          {
            name: '📈 Totais',
            value: `${totals.playerCount} jogadores • ${totals.kills} kills • ${totals.deaths} deaths`,
            inline: false,
          },
          {
            name: '⚔️ Ranking por Guild',
            value: '```\n' + guildRankingText.substring(0, 1000) + '\n```',
            inline: false,
          },
        ],
        footer: {
          text: `Hoje às ${String(matchHour).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')} • Tentativa ${attempt}${forceProcess ? ' (forçado)' : ''}`,
        },
        timestamp: new Date().toISOString(),
      };

      // Embed 2: Ranking table (monospaced code block)
      const embed2 = {
        title: '🏆 Ranking Completo',
        description: '```\n' + rankingTableText.substring(0, 3990) + '\n```',
        color: embedColor,
      };

      // Embed 3: Closing message with link
      const frontendUrlRaw = Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app';
      const frontendUrl = frontendUrlRaw.replace(/\/+$/, ''); // Remove trailing slashes
      const tabParam = isThrone ? 'throne' : 'ranking';
      const rankingLink = `${frontendUrl}/?tab=${tabParam}&date=${matchDate}&hour=${matchHour}`;
      
      const embed3 = {
        description: `${footerMessage}\n\n🔗 **[Ver ranking completo no site](${rankingLink})**`,
        color: 0x9b87f5,
      };

      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed1, embed2, embed3] }),
      });

      if (!discordResponse.ok) {
        console.error('[Auto Process] Failed to post to Discord:', await discordResponse.text());
      } else {
        console.log(`[Auto Process] Successfully posted ${eventType} to Discord`);
      }

      // ===== Fogo Amigo follow-up DESATIVADO =====
      // Postagem automática do ranking Fogo Amigo foi desabilitada.
      // O ranking continua disponível no site e pode ser publicado manualmente via botão "Publicar no Discord".
    } else {
      console.log(`[Auto Process] No Discord webhook configured for ${eventType}`);
    }

    console.log(`[Auto Process] Completed ${eventType} successfully`);

    // Fire-and-forget milestones check (non-blocking)
    try {
      const milestonesUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-milestones`;
      fetch(milestonesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({}),
      }).catch((e) => console.error('[Auto Process] check-milestones invoke failed:', e));
    } catch (e) {
      console.error('[Auto Process] check-milestones setup error:', e);
    }

    // Fire-and-forget badges check (non-blocking)
    try {
      const badgesUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-badges`;
      fetch(badgesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({}),
      }).catch((e) => console.error('[Auto Process] check-badges invoke failed:', e));
    } catch (e) {
      console.error('[Auto Process] check-badges setup error:', e);
    }


    return {
      success: true,
      status: 'processed',
      matchId: newMatch.id,
      matchDate,
      matchHour,
      playerCount: totals.playerCount,
      totalKills: totals.kills,
      attempt,
      forceProcess,
      eventType,
    };
  };

  try {
    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON, use defaults
    }

    // --- Authentication ---
    const authHeader = req.headers.get('Authorization');

    if (body.trigger === 'cron') {
      // Cron calls come from pg_net with the service role or anon key.
      // Validate that the bearer token matches the service role key or anon key.
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      const token = authHeader?.replace('Bearer ', '') || '';
      if (!token || (token !== serviceRoleKey && token !== anonKey)) {
        console.error('[Auto Process] Unauthorized cron trigger attempt');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (edgeRuntime?.waitUntil) {
        edgeRuntime.waitUntil(
          processRanking(body).catch((e) => {
            console.error('[Auto Process][cron] Background error:', e);
          }),
        );
      } else {
        await processRanking(body);
      }

      return new Response(
        JSON.stringify({ accepted: true, trigger: 'cron' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Manual / UI calls: require authenticated admin or moderator
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check admin or moderator role using service role client
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'moderator'])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin or moderator role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Default (manual / UI): run synchronously and return result.
    const result = await processRanking(body);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('[Auto Process] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
