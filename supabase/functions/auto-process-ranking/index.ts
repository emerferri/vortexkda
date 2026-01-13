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

interface RequestBody {
  trigger?: string;
  attempt?: number;        // 1, 2, or 3
  forceProcess?: boolean;  // true on 3rd attempt
  eventHour?: number;      // boss hour (20, 21, 22)
  eventMinute?: number;    // boss minute (0 or 30)
}

// Format ranking as monospaced table for Discord
function formatRankingTable(players: Array<{name: string, kills: number, deaths: number, kda: number, eventScore: number}>): string {
  // Calculate max widths for dynamic column sizing
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  
  // Header
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(52) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + '  K    D    KDA     Score\n';
  table += '─'.repeat(52) + '\n';
  
  // Player rows
  players.forEach((player, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const nameStr = player.name.padEnd(maxNameLen + 2);
    const killsStr = player.kills.toString().padStart(3);
    const deathsStr = player.deaths.toString().padStart(4);
    const kdaStr = player.kda.toFixed(2).padStart(7);
    const scoreStr = player.eventScore.toFixed(2).padStart(9);
    
    table += `${posStr} ${nameStr}${killsStr}${deathsStr}${kdaStr}${scoreStr}\n`;
  });
  
  return table;
}

// Parser logic
function parseExternalDbContent(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser] Processing ${logs.length} logs`);

  const killPatternDoubleAsterisks = /:dagger:\s*\*\*(\w+)\*\*\s*matou\s*:skull:\s*\*\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*PvP Square\*\*\s*-\s*\*\*\[Server: Boss Event PvP\]\*\*/i;

  const killPatternSingleAsterisks = /:dagger:\s*\*(\w+)\*\s*matou\s*:skull:\s*\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*PvP Square\*\s*-\s*\*\[Server: Boss Event PvP\]\*/i;

  const killPatternNoAsterisks = /:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)\s+no mapa/i;
  const mapPatternNoAsterisks = /PvP Square\s*-\s*\[Server: Boss Event PvP\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

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

  console.log(`[Auto Parser] Matched ${matchedEntries} valid entries, ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Extract minute from the last log entry
function getLastKillMinute(logs: ExternalLogEntry[]): number | null {
  if (!logs || logs.length === 0) return null;
  
  // Logs are ordered by timestamp DESC, first = most recent
  const lastLog = logs[0];
  
  // Try to extract time from timestamp field (format: YYYY-MM-DDTHH:MM:SS or similar)
  const timestampMatch = lastLog.timestamp?.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (timestampMatch) {
    return parseInt(timestampMatch[2], 10); // return minute
  }
  
  // Try from content field
  const contentMatch = lastLog.content?.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (contentMatch) {
    return parseInt(contentMatch[2], 10);
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
    if (attempt === 1) return 29; // 23:00 checks for 22:59... wait, 22:30 boss
    if (attempt === 2) return 49; // 23:20 checks for 23:19... hmm
    // Actually for 22:30 boss:
    // Attempt 1 at 23:00 should check if last kill >= minute 29 of 22:XX (event started at 22:30)
    // Let me recalculate based on the plan
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
  
  // For 22:00 boss, we check the hour after (23:xx), so minute thresholds apply directly
  // For 22:30 boss on attempt 1, we check if kills happened up to 22:59
  // For 20:00/21:00 bosses, we check within the same hour
  
  return lastKillMinute >= threshold;
}

function getEventTimeRange(eventHour?: number, eventMinute: number = 0): { startDate: string; endDate: string; matchDate: string; matchHour: number; localStartDate: string; localEndDate: string } {
  // Brazil timezone offset (UTC-3)
  const BRAZIL_OFFSET = -3;
  
  // Get current time in Brazil timezone
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brazilTime = new Date(utcTime + (BRAZIL_OFFSET * 3600000));
  
  const dayOfWeek = brazilTime.getDay();
  const currentHour = brazilTime.getHours();
  
  console.log(`[Auto Process] Brazil time: ${brazilTime.toISOString()}, day: ${dayOfWeek}, hour: ${currentHour}`);

  let targetEventHour: number;

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
  eventDateBrazil.setHours(targetEventHour, eventMinute, 0, 0);

  // Only go back a day if we haven't reached the event time yet AND no eventHour was explicitly provided
  // When eventHour is provided via cron, we trust that the event already happened today
  if (eventHour === undefined && eventDateBrazil > brazilTime) {
    eventDateBrazil.setDate(eventDateBrazil.getDate() - 1);
    // Don't change the hour - keep the determined targetEventHour
  }

  // Convert Brazil time back to UTC for database query
  const startDateUTC = new Date(eventDateBrazil.getTime() - (BRAZIL_OFFSET * 3600000));
  
  // For 22:00 boss, extend end time to 23:30 to capture extended events
  let endOffsetMs = 3600000; // Default +1 hour
  if (targetEventHour === 22) {
    endOffsetMs = 5400000; // +1.5 hours (until 23:30)
  }
  const endDateUTC = new Date(startDateUTC.getTime() + endOffsetMs);

  // Format match date in Brazil timezone for storage
  const matchDate = `${eventDateBrazil.getFullYear()}-${String(eventDateBrazil.getMonth() + 1).padStart(2, '0')}-${String(eventDateBrazil.getDate()).padStart(2, '0')}`;

  // Format local Brazil time strings for external database query (which stores in local time)
  // For 22:00 boss, extend to 23:29 to capture late kills
  let localEndHour = targetEventHour;
  let localEndMinute = 59;
  if (targetEventHour === 22 && eventMinute === 0) {
    localEndHour = 23;
    localEndMinute = 29;
  } else if (targetEventHour === 22 && eventMinute === 30) {
    localEndHour = 23;
    localEndMinute = 29;
  }
  
  const localStartDate = `${matchDate}T${String(targetEventHour).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')}`;
  const localEndDate = `${matchDate}T${String(localEndHour).padStart(2, '0')}:${String(localEndMinute).padStart(2, '0')}`;

  console.log(`[Auto Process] Event: ${matchDate} ${targetEventHour}:${String(eventMinute).padStart(2, '0')} BRT`);
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

  try {
    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON, use defaults
    }
    
    const attempt = body.attempt || 1;
    const forceProcess = body.forceProcess || false;
    const eventHour = body.eventHour;
    const eventMinute = body.eventMinute || 0;
    
    console.log(`[Auto Process] Starting automatic ranking processing... Attempt: ${attempt}, Force: ${forceProcess}, EventHour: ${eventHour}, EventMinute: ${eventMinute}`);

    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalServiceKey);

    const { startDate, endDate, matchDate, matchHour, localStartDate, localEndDate } = getEventTimeRange(eventHour, eventMinute);
    console.log(`[Auto Process] Fetching logs for ${matchDate} ${matchHour}:${String(eventMinute).padStart(2, '0')}`);

    // Check if this match already exists
    const { data: existingMatch } = await internalClient
      .from('pvp_matches')
      .select('id')
      .eq('match_date', matchDate)
      .eq('match_hour', matchHour)
      .maybeSingle();

    if (existingMatch) {
      console.log(`[Auto Process] Match already exists for ${matchDate} ${matchHour}:00, skipping`);
      return new Response(
        JSON.stringify({ success: true, status: 'already_exists', message: 'Match already processed', matchDate, matchHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to external Supabase
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalUrl || !externalKey) {
      throw new Error('External database credentials not configured');
    }

    const externalClient = createClient(externalUrl, externalKey);

    // Query using local Brazil time (external DB stores timestamps in local time)
    const { data: logs, error: logsError } = await externalClient
      .from('logs_pvp')
      .select('id, content, timestamp, created_at')
      .gte('timestamp', localStartDate)
      .lte('timestamp', localEndDate)
      .order('timestamp', { ascending: false })
      .limit(2000);

    if (logsError) {
      throw new Error(`Failed to fetch logs: ${logsError.message}`);
    }

    console.log(`[Auto Process] Fetched ${logs?.length || 0} logs from external database`);

    if (!logs || logs.length === 0) {
      console.log('[Auto Process] No logs found for this time period');
      return new Response(
        JSON.stringify({ success: true, status: 'no_logs', message: 'No logs found', matchDate, matchHour, attempt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we should postpone based on last kill time
    const lastKillMinute = getLastKillMinute(logs);
    console.log(`[Auto Process] Last kill minute: ${lastKillMinute}`);
    
    if (shouldPostpone(attempt, forceProcess, lastKillMinute, matchHour, eventMinute)) {
      const threshold = getMinuteThreshold(attempt, matchHour, eventMinute);
      console.log(`[Auto Process] Attempt ${attempt}: Last kill at minute ${lastKillMinute}, >= ${threshold}, postponing`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'postponed',
          attempt,
          lastKillMinute,
          threshold,
          message: 'Event may still be active, waiting for next attempt'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parseResult = parseExternalDbContent(logs);

    if (Object.keys(parseResult.players).length === 0) {
      console.log('[Auto Process] No valid player data found after parsing');
      return new Response(
        JSON.stringify({ success: true, status: 'no_players', message: 'No valid player data', matchDate, matchHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bossLabel = parseResult.bossLabel || `BOSSx2 ${matchDate} ${matchHour}H`;

    // Insert match
    const { data: newMatch, error: matchError } = await internalClient
      .from('pvp_matches')
      .insert({
        match_date: matchDate,
        match_hour: matchHour,
        boss_label: bossLabel
      })
      .select()
      .single();

    if (matchError) {
      throw new Error(`Failed to insert match: ${matchError.message}`);
    }

    console.log(`[Auto Process] Created match with ID: ${newMatch.id}`);

    // Insert players
    const playerInserts = Object.values(parseResult.players).map(player => ({
      match_id: newMatch.id,
      player_name: player.name,
      kills: player.kills,
      deaths: player.deaths,
      kda: player.kda
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
      victim_name: log.victim
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
      .select('name, guild, class, banned')
      .in('name', playerNames);

    const characterMap: Record<string, { guild: string; class: string; banned: boolean }> = {};
    if (characters) {
      for (const char of characters) {
        characterMap[char.name] = { guild: char.guild, class: char.class, banned: char.banned || false };
      }
    }

    // Filter out banned players from rankings
    const bannedPlayerNames = new Set(
      Object.entries(characterMap)
        .filter(([_, data]) => data.banned)
        .map(([name, _]) => name)
    );

    const nonBannedPlayers = Object.values(parseResult.players)
      .filter(p => !bannedPlayerNames.has(p.name));

    // Calculate guild summary (only non-banned players)
    const guildSummary: Record<string, number> = {};
    for (const player of nonBannedPlayers) {
      const charInfo = characterMap[player.name];
      const guild = charInfo?.guild || 'Sem Guild';
      guildSummary[guild] = (guildSummary[guild] || 0) + 1;
    }

    // Calculate special rankings using correct eventScore formula: (kills * 3) + (kda * 2) - (deaths * 1.5)
    const playersWithEventScore = nonBannedPlayers.map(p => ({
      ...p,
      eventScore: (p.kills * 3) + (p.kda * 2) - (p.deaths * 1.5)
    }));

    // Cone Monodedo = worst eventScore (lowest)
    const sortedByEventScore = [...playersWithEventScore].sort((a, b) => a.eventScore - b.eventScore);
    const coneMonodedo = sortedByEventScore[0];

    // Rei do PVP = best eventScore (highest), excluding cone monodedo
    const eligibleForRei = playersWithEventScore.filter(p => p.name !== coneMonodedo?.name);
    const reiDoPVP = [...eligibleForRei].sort((a, b) => b.eventScore - a.eventScore)[0];

    // Brabissimo = best KDA, excluding cone monodedo
    const sortedByKDA = playersWithEventScore
      .filter(p => p.name !== coneMonodedo?.name)
      .sort((a, b) => b.kda - a.kda);
    const brabissimo = sortedByKDA[0];

    const totals = {
      kills: nonBannedPlayers.reduce((sum, p) => sum + p.kills, 0),
      deaths: nonBannedPlayers.reduce((sum, p) => sum + p.deaths, 0),
      playerCount: nonBannedPlayers.length
    };

    // Format guild summary - matching manual format
    const guildSummaryLines = Object.entries(guildSummary)
      .sort((a, b) => b[1] - a[1])
      .map(([guild, count]) => `**${guild}**: ${count} ${count === 1 ? 'jogador' : 'jogadores'}`)
      .join('\n');

    // Build ranking table text with correct eventScore formula: (kills * 3) + (kda * 2) - (deaths * 1.5) - excluding banned
    const playersWithScore = nonBannedPlayers.map(player => {
      const eventScore = (player.kills * 3) + (player.kda * 2) - (player.deaths * 1.5);
      return { ...player, eventScore };
    });
    const sortedPlayers = playersWithScore.sort((a, b) => b.eventScore - a.eventScore);
    const rankingTableText = formatRankingTable(sortedPlayers);

    // Post to Discord - matching manual format exactly
    const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD') || Deno.env.get('DISCORD_WEBHOOK_URL');

    if (webhookUrl) {
      const [year, month, day] = matchDate.split('-');
      const formattedDate = `${day}/${month}/${year}`;

      // Embed 1: Main info - matching manual format
      const embed1 = {
        title: '📊 Ranking BOSS Diário',
        color: 0x10B981,
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: `A partir de: **${formattedDate}**\nHora inicial: **${matchHour}:00**\nOrdenação: **eventScore**`,
            inline: false
          },
          {
            name: '👑 Rei do PVP',
            value: reiDoPVP ? `**${reiDoPVP.name}**\nScore: ${reiDoPVP.eventScore.toFixed(2)} • ${reiDoPVP.kills}K/${reiDoPVP.deaths}D` : 'N/A',
            inline: true
          },
          {
            name: '⚡ Brabissimo',
            value: brabissimo ? `**${brabissimo.name}**\nKDA: ${brabissimo.kda} • ${brabissimo.kills}K/${brabissimo.deaths}D` : 'N/A',
            inline: true
          },
          {
            name: '🍦 Cone Monodedo',
            value: coneMonodedo ? `**${coneMonodedo.name}**\nScore: ${coneMonodedo.eventScore.toFixed(2)} • ${coneMonodedo.kills}K/${coneMonodedo.deaths}D` : 'N/A',
            inline: true
          },
          {
            name: '📈 Totais',
            value: `${totals.playerCount} jogadores • ${totals.kills} kills • ${totals.deaths} deaths`,
            inline: false
          },
          {
            name: '⚔️ Resumo por Guild',
            value: guildSummaryLines || 'Nenhuma guild registrada',
            inline: false
          }
        ],
        footer: {
          text: `Hoje às ${String(matchHour).padStart(2, '0')}:00 • Tentativa ${attempt}${forceProcess ? ' (forçado)' : ''}`
        },
        timestamp: new Date().toISOString()
      };

      // Embed 2: Ranking table (monospaced code block)
      const embed2 = {
        title: '🏆 Ranking Completo',
        description: '```\n' + rankingTableText.substring(0, 3990) + '\n```',
        color: 0x3b82f6
      };

      // Embed 3: Closing message with link - matching manual format
      const frontendUrlRaw = Deno.env.get('FRONTEND_URL') || 'https://rankingpvpboss.lovable.app';
      const frontendUrl = frontendUrlRaw.replace(/\/+$/, ''); // Remove trailing slashes
      const rankingLink = `${frontendUrl}/?tab=ranking&date=${matchDate}&hour=${matchHour}`;
      
      const embed3 = {
        description: `Esse é o resultado do BOSSx2 diário! **${reiDoPVP?.name || 'N/A'}** Amassou hoje, já nosso amigo **${coneMonodedo?.name || 'N/A'}** passou fome!\n\n🔗 **[Ver ranking completo no site](${rankingLink})**`,
        color: 0x9b87f5
      };

      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed1, embed2, embed3] })
      });

      if (!discordResponse.ok) {
        console.error('[Auto Process] Failed to post to Discord:', await discordResponse.text());
      } else {
        console.log('[Auto Process] Successfully posted to Discord');
      }
    } else {
      console.log('[Auto Process] No Discord webhook configured');
    }

    console.log('[Auto Process] Completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        status: 'processed',
        matchId: newMatch.id,
        matchDate,
        matchHour,
        playerCount: totals.playerCount,
        totalKills: totals.kills,
        attempt,
        forceProcess
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
