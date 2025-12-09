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

// Parser logic (replicating the TypeScript parser)
function parseExternalDbContent(logs: ExternalLogEntry[]): ParseResult {
  const players: Record<string, PlayerStats> = {};
  const killLogs: KillLog[] = [];
  let bossLabel = '';
  let matchedEntries = 0;

  console.log(`[Auto Parser] Processing ${logs.length} logs`);

  // Pattern with double asterisks: **name** (external database)
  const killPatternDoubleAsterisks = /:dagger:\\s*\\*\\*(\w+)\*\*\\s*matou\\s*:skull:\\s*\\*\\*(\w+)\*\*/i;
  const mapPatternDoubleAsterisks = /\*\*PvP Square\*\*\\s*-\\s*\*\*\[Server: Boss Event PvP\]\*\*/i;

  // Pattern with single asterisks: *name*
  const killPatternSingleAsterisks = /:dagger:\\s*\\*(\w+)\*\\s*matou\\s*:skull:\\s*\\*(\w+)\*/i;
  const mapPatternSingleAsterisks = /\*PvP Square\*\\s*-\\s*\*\[Server: Boss Event PvP\]\*/i;

  // Pattern without asterisks
  const killPatternNoAsterisks = /:dagger:\\s*(\w+)\\s+matou\\s+:skull:\\s*(\w+)\\s+no mapa/i;
  const mapPatternNoAsterisks = /PvP Square\\s*-\\s*\[Server: Boss Event PvP\]/i;

  const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;

  for (const log of logs) {
    if (!log.content) continue;

    const content = log.content;

    // Check if it's a valid PvP map (any format)
    const hasValidMap = mapPatternDoubleAsterisks.test(content) ||
      mapPatternSingleAsterisks.test(content) ||
      mapPatternNoAsterisks.test(content);

    if (!hasValidMap) {
      continue;
    }

    // Extract date for boss label
    if (!bossLabel) {
      const dateMatch = content.match(datePattern);
      if (dateMatch) {
        const [, day, month, year, hour] = dateMatch;
        bossLabel = `BOSSx2 ${day}/${month}/${year} ${hour}H`;
      }
    }

    // Try to extract killer and victim (try all patterns)
    let killMatch = content.match(killPatternDoubleAsterisks);
    if (!killMatch) {
      killMatch = content.match(killPatternSingleAsterisks);
    }
    if (!killMatch) {
      killMatch = content.match(killPatternNoAsterisks);
    }

    if (killMatch) {
      const killer = killMatch[1];
      const victim = killMatch[2];

      matchedEntries++;

      // Initialize killer stats
      if (!players[killer]) {
        players[killer] = { name: killer, kills: 0, deaths: 0, kda: 0 };
      }
      players[killer].kills++;

      // Initialize victim stats
      if (!players[victim]) {
        players[victim] = { name: victim, kills: 0, deaths: 0, kda: 0 };
      }
      players[victim].deaths++;

      killLogs.push({ killer, victim });
    }
  }

  // Calculate KDA
  for (const player of Object.values(players)) {
    player.kda = player.deaths === 0 ? player.kills : parseFloat((player.kills / player.deaths).toFixed(2));
  }

  console.log(`[Auto Parser] Matched ${matchedEntries} valid entries, ${Object.keys(players).length} unique players`);

  return { players, bossLabel, killLogs };
}

// Get the time range for the most recent boss event
function getEventTimeRange(): { startDate: string; endDate: string; matchDate: string; matchHour: number } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, 4 = Thursday
  const currentHour = now.getHours();

  // Boss event times:
  // Monday: 21:00 and 22:00 (cron at 21:30 and 22:30)
  // Tuesday & Thursday: 20:00 and 22:00 (cron at 20:30 and 23:00)
  // Other days: 20:00 and 22:00 (cron at 20:30 and 22:30)
  let eventHour: number;

  if (dayOfWeek === 1) {
    // Monday: events at 21:00 and 22:00
    if (currentHour >= 22) {
      eventHour = 22;
    } else if (currentHour >= 21) {
      eventHour = 21;
    } else {
      eventHour = 22; // Previous day's last event
    }
  } else if (dayOfWeek === 2 || dayOfWeek === 4) {
    // Tuesday & Thursday: events at 20:00 and 22:00 (cron runs at 23:00 for 22:00 event)
    if (currentHour >= 23) {
      eventHour = 22; // 23:00 cron processes 22:00 event
    } else if (currentHour >= 22) {
      eventHour = 22;
    } else if (currentHour >= 20) {
      eventHour = 20;
    } else {
      eventHour = 22; // Previous day's last event
    }
  } else {
    // Other days: events at 20:00 and 22:00
    if (currentHour >= 22) {
      eventHour = 22;
    } else if (currentHour >= 20) {
      eventHour = 20;
    } else {
      eventHour = 22; // Previous day's last event
    }
  }

  // Create date strings
  const eventDate = new Date(now);
  eventDate.setHours(eventHour, 0, 0, 0);

  // If we're looking at an event that would be in the future, go back to yesterday
  if (eventDate > now) {
    eventDate.setDate(eventDate.getDate() - 1);
    // Adjust for the actual event time of the previous day
    const prevDayOfWeek = eventDate.getDay();
    if (prevDayOfWeek === 1) {
      eventDate.setHours(22, 0, 0, 0); // Monday last event at 22:00
    } else {
      eventDate.setHours(22, 0, 0, 0); // Other days last event at 22:00
    }
  }

  const startDate = new Date(eventDate);
  const endDate = new Date(eventDate);
  endDate.setHours(endDate.getHours() + 1); // Event lasts 1 hour

  const matchDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    matchDate,
    matchHour: eventHour
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Auto Process] Starting automatic ranking processing...');

    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalServiceKey);

    // Get time range for the event
    const { startDate, endDate, matchDate, matchHour } = getEventTimeRange();
    console.log(`[Auto Process] Fetching logs from ${startDate} to ${endDate}`);

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
        JSON.stringify({ success: true, message: 'Match already processed', matchDate, matchHour }),
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

    // Fetch logs from external database
    const { data: logs, error: logsError } = await externalClient
      .from('logs_pvp')
      .select('id, content, timestamp, created_at')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .order('timestamp', { ascending: false })
      .limit(2000);

    if (logsError) {
      throw new Error(`Failed to fetch logs: ${logsError.message}`);
    }

    console.log(`[Auto Process] Fetched ${logs?.length || 0} logs from external database`);

    if (!logs || logs.length === 0) {
      console.log('[Auto Process] No logs found for this time period');
      return new Response(
        JSON.stringify({ success: true, message: 'No logs found', matchDate, matchHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the logs
    const parseResult = parseExternalDbContent(logs);

    if (Object.keys(parseResult.players).length === 0) {
      console.log('[Auto Process] No valid player data found after parsing');
      return new Response(
        JSON.stringify({ success: true, message: 'No valid player data', matchDate, matchHour }),
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
      // Don't throw, kill logs are optional
    }

    // Calculate special rankings for Discord
    const sortedByKills = Object.values(parseResult.players).sort((a, b) => b.kills - a.kills);
    const sortedByDeaths = Object.values(parseResult.players).sort((a, b) => {
      const scoreA = a.kills - a.deaths;
      const scoreB = b.kills - b.deaths;
      return scoreA - scoreB;
    });

    const reiDoPVP = sortedByKills[0];
    const coneMonodedo = sortedByDeaths[0];

    // Brabíssimo - best KDA excluding cone monodedo
    const sortedByKDA = Object.values(parseResult.players)
      .filter(p => p.name !== coneMonodedo?.name)
      .sort((a, b) => b.kda - a.kda);
    const brabissimo = sortedByKDA[0];

    const totals = {
      kills: Object.values(parseResult.players).reduce((sum, p) => sum + p.kills, 0),
      deaths: Object.values(parseResult.players).reduce((sum, p) => sum + p.deaths, 0),
      playerCount: Object.keys(parseResult.players).length
    };

    // Post to Discord (text only, no images)
    const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD') || Deno.env.get('DISCORD_WEBHOOK_URL');

    if (webhookUrl) {
      const embed = {
        title: '🤖 Ranking Automático - ' + bossLabel,
        color: 0x10B981,
        fields: [
          {
            name: '👑 Rei do PVP',
            value: reiDoPVP ? `**${reiDoPVP.name}**\n${reiDoPVP.kills} kills • ${reiDoPVP.deaths} deaths` : 'N/A',
            inline: true
          },
          {
            name: '⚡ Brabíssimo',
            value: brabissimo ? `**${brabissimo.name}**\nKDA: ${brabissimo.kda}` : 'N/A',
            inline: true
          },
          {
            name: '🍦 Cone Monodedo',
            value: coneMonodedo ? `**${coneMonodedo.name}**\n${coneMonodedo.deaths} deaths` : 'N/A',
            inline: true
          },
          {
            name: '📈 Totais',
            value: `${totals.playerCount} jogadores • ${totals.kills} kills • ${totals.deaths} deaths`,
            inline: false
          },
          {
            name: '🏆 Top 5 Kills',
            value: sortedByKills.slice(0, 5).map((p, i) => `${i + 1}. **${p.name}** - ${p.kills} kills`).join('\n'),
            inline: true
          },
          {
            name: '💀 Top 5 Deaths',
            value: Object.values(parseResult.players)
              .sort((a, b) => b.deaths - a.deaths)
              .slice(0, 5)
              .map((p, i) => `${i + 1}. **${p.name}** - ${p.deaths} deaths`).join('\n'),
            inline: true
          }
        ],
        footer: {
          text: '⚙️ Gerado automaticamente'
        },
        timestamp: new Date().toISOString()
      };

      const discordResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
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
        matchId: newMatch.id,
        matchDate,
        matchHour,
        playerCount: totals.playerCount,
        totalKills: totals.kills
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
