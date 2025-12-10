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

function getEventTimeRange(): { startDate: string; endDate: string; matchDate: string; matchHour: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentHour = now.getHours();

  let eventHour: number;

  if (dayOfWeek === 1) {
    if (currentHour >= 22) eventHour = 22;
    else if (currentHour >= 21) eventHour = 21;
    else eventHour = 22;
  } else if (dayOfWeek === 2 || dayOfWeek === 4) {
    if (currentHour >= 23) eventHour = 22;
    else if (currentHour >= 22) eventHour = 22;
    else if (currentHour >= 20) eventHour = 20;
    else eventHour = 22;
  } else {
    if (currentHour >= 22) eventHour = 22;
    else if (currentHour >= 20) eventHour = 20;
    else eventHour = 22;
  }

  const eventDate = new Date(now);
  eventDate.setHours(eventHour, 0, 0, 0);

  if (eventDate > now) {
    eventDate.setDate(eventDate.getDate() - 1);
    eventDate.setHours(22, 0, 0, 0);
  }

  const startDate = new Date(eventDate);
  const endDate = new Date(eventDate);
  endDate.setHours(endDate.getHours() + 1);

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
    }

    // Fetch character data
    const playerNames = Object.keys(parseResult.players);
    const { data: characters } = await internalClient
      .from('characters')
      .select('name, guild, class')
      .in('name', playerNames);

    const characterMap: Record<string, { guild: string; class: string }> = {};
    if (characters) {
      for (const char of characters) {
        characterMap[char.name] = { guild: char.guild, class: char.class };
      }
    }

    // Calculate guild summary
    const guildSummary: Record<string, number> = {};
    for (const playerName of playerNames) {
      const charInfo = characterMap[playerName];
      const guild = charInfo?.guild || 'Sem Guild';
      guildSummary[guild] = (guildSummary[guild] || 0) + 1;
    }

    // Calculate special rankings
    const sortedByKills = Object.values(parseResult.players).sort((a, b) => b.kills - a.kills);
    const sortedByDeaths = Object.values(parseResult.players).sort((a, b) => {
      const scoreA = a.kills - a.deaths;
      const scoreB = b.kills - b.deaths;
      return scoreA - scoreB;
    });

    const reiDoPVP = sortedByKills[0];
    const coneMonodedo = sortedByDeaths[0];

    const sortedByKDA = Object.values(parseResult.players)
      .filter(p => p.name !== coneMonodedo?.name)
      .sort((a, b) => b.kda - a.kda);
    const brabissimo = sortedByKDA[0];

    const totals = {
      kills: Object.values(parseResult.players).reduce((sum, p) => sum + p.kills, 0),
      deaths: Object.values(parseResult.players).reduce((sum, p) => sum + p.deaths, 0),
      playerCount: Object.keys(parseResult.players).length
    };

    // Format guild summary - matching manual format
    const guildSummaryLines = Object.entries(guildSummary)
      .sort((a, b) => b[1] - a[1])
      .map(([guild, count]) => `**${guild}**: ${count} ${count === 1 ? 'jogador' : 'jogadores'}`)
      .join('\n');

    // Build ranking table text
    const sortedPlayers = Object.values(parseResult.players).sort((a, b) => b.kills - a.kills);
    let rankingTableLines = '';
    sortedPlayers.forEach((player, index) => {
      const charInfo = characterMap[player.name];
      const guild = charInfo?.guild || '-';
      const playerClass = charInfo?.class || '-';
      const eventScore = player.kills - player.deaths;
      rankingTableLines += `**#${index + 1}** ${player.name} | ${playerClass} | ${guild} | ${player.kills}K/${player.deaths}D | KDA: ${player.kda} | Score: ${eventScore}\n`;
    });

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
            value: reiDoPVP ? `**${reiDoPVP.name}**\n${reiDoPVP.kills} kills • ${reiDoPVP.deaths} deaths` : 'N/A',
            inline: true
          },
          {
            name: '⚡ Brabissimo',
            value: brabissimo ? `**${brabissimo.name}**\n${brabissimo.kills} kills em 1 partida` : 'N/A',
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
            name: '⚔️ Resumo por Guild',
            value: guildSummaryLines || 'Nenhuma guild registrada',
            inline: false
          }
        ],
        footer: {
          text: `Hoje às ${String(matchHour).padStart(2, '0')}:00`
        },
        timestamp: new Date().toISOString()
      };

      // Embed 2: Ranking table
      const embed2 = {
        title: '🏆 Ranking Completo',
        description: rankingTableLines.substring(0, 4000), // Discord limit
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