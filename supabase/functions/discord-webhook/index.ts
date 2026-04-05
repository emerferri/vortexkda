import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpecialRankings {
  reiDoPVP: { name: string; kills: number; deaths: number; matches: number };
  brabissimo: { name: string; singleMatchKills: number; matches: number };
  coneMonodedo: { name: string; deaths: number; matches: number };
}

interface StreakRankings {
  first: { name: string; streak: number; type: string; emoji: string } | null;
  second: { name: string; streak: number; type: string; emoji: string } | null;
  third: { name: string; streak: number; type: string; emoji: string } | null;
}

interface Filters {
  class?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number;
  hourTo?: number;
  sortBy?: string;
}

interface GuildData {
  guild: string;
  playerCount: number;
  kills: number;
  deaths: number;
  score: number;
}

interface PlayerData {
  name: string;
  kills: number;
  deaths: number;
  kda: number;
  eventScore: number;
}

interface KillLogEntry {
  killer_name: string;
  victim_name: string;
}

interface GeneralRankingBody {
  type?: 'general';
  environment: 'homolog' | 'prod';
  filters: Filters;
  specialRankings: SpecialRankings;
  image: string;
  specialCardsImage: string;
  totals: {
    kills: number;
    deaths: number;
    playerCount: number;
  };
  guildSummary: Record<string, number>; // Legacy format (backward compatibility)
  guildRanking?: GuildData[]; // New format with full stats
  playerRanking?: PlayerData[]; // Player ranking for text table
  killLogs?: KillLogEntry[]; // Kill logs for streak calculation
  eventType?: 'boss_event' | 'throne_conquest'; // Type of event
}

interface PutinhaEntry {
  position: number;
  killer: string;
  killerGuild: string;
  victim: string;
  victimGuild: string;
  deaths: number;
  level: string;
}

interface PutinhaBody {
  type: 'putinha';
  environment: 'homolog' | 'prod';
  filters: Filters;
  putinhaData: PutinhaEntry[];
  totals: { relationCount: number };
}

interface KillStreakBody {
  type: 'killstreak';
  environment: 'homolog' | 'prod';
  filters: Filters;
  streakRankings: StreakRankings;
  image: string;
  totals: {
    playerCount: number;
  };
}

type RequestBody = GeneralRankingBody | KillStreakBody | PutinhaBody;

// Format guild ranking as monospaced table for Discord (same as auto-process-ranking)
function formatGuildRankingTable(guilds: GuildData[]): string {
  if (!guilds || guilds.length === 0) return 'Nenhuma guild registrada';
  
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

// Format player ranking as monospaced table for Discord (same as auto-process-ranking)
function formatRankingTable(players: PlayerData[]): string {
  if (!players || players.length === 0) return '';
  
  const maxNameLen = Math.max(7, ...players.map(p => p.name.length));
  
  let table = '🏆 RANKING PVP\n';
  table += '═'.repeat(52) + '\n\n';
  table += ' Pos  ' + 'Jogador'.padEnd(maxNameLen + 2) + '  K    D    KDA     Score\n';
  table += '─'.repeat(52) + '\n';
  
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

// Format putinha ranking as monospaced table for Discord
function formatPutinhaTable(entries: PutinhaEntry[]): string {
  if (!entries || entries.length === 0) return 'Nenhuma relação encontrada';
  
  const maxKillerLen = Math.max(9, ...entries.map(e => e.killer.length));
  const maxVictimLen = Math.max(8, ...entries.map(e => e.victim.length));
  
  let table = '💀 RANKING MINHA PUTINHA\n';
  table += '═'.repeat(60) + '\n\n';
  table += ' Pos  ' + 'Dominador'.padEnd(maxKillerLen + 2) + 'Kills  ' + 'Putinha'.padEnd(maxVictimLen + 2) + 'Nível\n';
  table += '─'.repeat(60) + '\n';
  
  entries.forEach((entry, index) => {
    const pos = index + 1;
    let posStr: string;
    
    if (pos === 1) posStr = ' 🥇  ';
    else if (pos === 2) posStr = ' 🥈  ';
    else if (pos === 3) posStr = ' 🥉  ';
    else posStr = ` #${pos.toString().padStart(2)} `;
    
    const killerStr = entry.killer.padEnd(maxKillerLen + 2);
    const killsStr = (entry.deaths.toString() + '×').padStart(5) + '  ';
    const victimStr = entry.victim.padEnd(maxVictimLen + 2);
    const levelStr = entry.level;
    
    table += `${posStr} ${killerStr}${killsStr}${victimStr}${levelStr}\n`;
  });
  
  return table;
}


function calculateBestKillStreakFromLogs(killLogs: KillLogEntry[]): { name: string; streak: number } | null {
  if (!killLogs || killLogs.length === 0) return null;

  const playerStreaks = new Map<string, number>();
  const playerMaxStreaks = new Map<string, number>();

  for (const log of killLogs) {
    const killer = log.killer_name;
    const victim = log.victim_name;

    const currentStreak = (playerStreaks.get(killer) || 0) + 1;
    playerStreaks.set(killer, currentStreak);

    const globalMax = playerMaxStreaks.get(killer) || 0;
    if (currentStreak > globalMax) {
      playerMaxStreaks.set(killer, currentStreak);
    }

    playerStreaks.set(victim, 0);
  }

  let best: { name: string; streak: number } | null = null;
  for (const [name, streak] of playerMaxStreaks.entries()) {
    if (streak >= 2 && (!best || streak > best.streak)) {
      best = { name, streak };
    }
  }

  return best;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client to check admin role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if user has admin role
    const { data: hasAdminRole, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError || !hasAdminRole) {
      console.error('Role check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: RequestBody = await req.json();
    const rankingType = body.type || 'general';
    console.log(`Received request to post ${rankingType} ranking to Discord from user ${user.email}`);
    
    // Get Discord webhook URL from environment secrets based on event type
    const generalBody = rankingType === 'general' ? body as GeneralRankingBody : null;
    const isThrone = generalBody?.eventType === 'throne_conquest';
    
    let webhookUrl: string | undefined;
    if (isThrone) {
      // Throne Conquest uses its own dedicated webhook
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_THRONE');
    } else if (body.environment === 'prod') {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
    } else {
      webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
    }
    
    if (!webhookUrl) {
      const webhookType = isThrone ? 'Throne Conquest' : body.environment;
      throw new Error(`Webhook URL not configured for ${webhookType}`);
    }
    
    console.log(`Publishing to ${body.environment} environment`);
    
    // Criar embeds baseado no tipo
    let embeds: any[];
    const formData = new FormData();
    
    if (rankingType === 'putinha') {
      const putinhaBody = body as PutinhaBody;
      
      const embed1 = {
        title: '💀 Ranking: Minha Putinha',
        description: `Quem morre 10+ vezes para o mesmo jogador\n**${putinhaBody.totals.relationCount}** relações de dominância`,
        color: 0xEF4444,
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: formatFilters(putinhaBody.filters),
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };

      const tableText = formatPutinhaTable(putinhaBody.putinhaData);
      const embed2 = {
        description: '```\n' + tableText.substring(0, 4000) + '\n```',
        color: 0xEF4444
      };

      const frontendUrl = 'https://rankingpvpboss.lovable.app';
      const embed3 = {
        description: `🔗 **[Ver ranking completo no site](${frontendUrl}/?tab=putinha)**`,
        color: 0x9b87f5
      };

      embeds = [embed1, embed2, embed3];
    } else if (rankingType === 'killstreak') {
      // Kill streak still uses image
      const killStreakBody = body as KillStreakBody;
      
      if (!body.image || typeof body.image !== 'string') {
        throw new Error('Image data is missing or invalid for killstreak');
      }
      
      const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([imageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
      formData.append('file1', blob, 'kill-streak-ranking.jpg');
      
      const fields = [];
      fields.push({
        name: '🔍 Filtros Aplicados',
        value: formatFilters(body.filters),
        inline: false
      });
      
      if (killStreakBody.streakRankings.first) {
        fields.push({
          name: `${killStreakBody.streakRankings.first.emoji} 1º Lugar - ${killStreakBody.streakRankings.first.type}`,
          value: `**${killStreakBody.streakRankings.first.name}**\n${killStreakBody.streakRankings.first.streak} kills seguidos`,
          inline: true
        });
      }
      
      if (killStreakBody.streakRankings.second) {
        fields.push({
          name: `${killStreakBody.streakRankings.second.emoji} 2º Lugar - ${killStreakBody.streakRankings.second.type}`,
          value: `**${killStreakBody.streakRankings.second.name}**\n${killStreakBody.streakRankings.second.streak} kills seguidos`,
          inline: true
        });
      }
      
      if (killStreakBody.streakRankings.third) {
        fields.push({
          name: `${killStreakBody.streakRankings.third.emoji} 3º Lugar - ${killStreakBody.streakRankings.third.type}`,
          value: `**${killStreakBody.streakRankings.third.name}**\n${killStreakBody.streakRankings.third.streak} kills seguidos`,
          inline: true
        });
      }
      
      fields.push({
        name: '📈 Total',
        value: `${killStreakBody.totals.playerCount} jogadores com streaks`,
        inline: false
      });
      
      const embed1 = {
        title: '🏆 Ranking de Kill Streak',
        description: 'Maiores sequências de kills sem morrer',
        color: 0xF59E0B,
        fields,
        timestamp: new Date().toISOString()
      };
      
      const embed2 = {
        image: {
          url: 'attachment://kill-streak-ranking.jpg'
        }
      };
      
      const firstPlayer = killStreakBody.streakRankings.first;
      const embed3 = {
        description: firstPlayer 
          ? `🔥 **${firstPlayer.name}** dominou com ${firstPlayer.streak} kills seguidos! ${firstPlayer.emoji} ${firstPlayer.type}!`
          : 'Ninguém conseguiu fazer uma sequência de kills neste período.',
        color: 0x9b87f5
      };
      
      embeds = [embed1, embed2, embed3];
    } else {
      // Ranking Geral - texto apenas, sem imagens
      const generalBody = body as GeneralRankingBody;
      const isThrone = generalBody.eventType === 'throne_conquest';
      
      // Títulos dinâmicos baseados no tipo de evento
      const rankingTitle = isThrone ? '📊 Ranking Throne Conquest' : '📊 Ranking BOSS Diário';
      const reiTitle = isThrone ? '👑 Rei do Trono!' : '👑 Rei do PVP';
      
      // Calculate kill streak from kill logs if available
      const bestStreak = generalBody.killLogs ? calculateBestKillStreakFromLogs(generalBody.killLogs) : null;
      
      // Best KDA player (brabissimo)
      const bestKDAPlayer = generalBody.specialRankings.brabissimo;
      const conePlayer = generalBody.specialRankings.coneMonodedo;
      
      const eventLabel = isThrone ? 'Throne Conquest' : 'Boss/evento';

      // Fetch dynamic phrases from database
      let dynamicPhrases: Record<string, string[]> = {};
      try {
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { data: phrasesData } = await serviceClient
          .from('discord_highlight_phrases')
          .select('category, phrase_template');
        if (phrasesData && phrasesData.length > 0) {
          for (const p of phrasesData) {
            if (!dynamicPhrases[p.category]) dynamicPhrases[p.category] = [];
            dynamicPhrases[p.category].push(p.phrase_template);
          }
        }
      } catch (e) {
        console.log('[Discord Webhook] Failed to fetch dynamic phrases, using defaults');
      }

      const nowDate = new Date();
      const startOfYear = new Date(nowDate.getFullYear(), 0, 0);
      const dayOfYear = Math.floor((nowDate.getTime() - startOfYear.getTime()) / 86400000);

      const selectPhrase = (category: string, name: string, value: string, fallback: string): string => {
        const phrases = dynamicPhrases[category];
        if (phrases && phrases.length > 0) {
          const template = phrases[dayOfYear % phrases.length];
          return template.replace(/\{name\}/g, name).replace(/\{value\}/g, value);
        }
        return fallback;
      };

      const footerLines: string[] = [`**Destaques ${eventLabel}:**`];
      if (bestStreak) {
        footerLines.push(`1 - ${selectPhrase('kill_streak', `**${bestStreak.name}**`, String(bestStreak.streak), `**${bestStreak.name}** matou ${bestStreak.streak} vezes sem morrer! é um monstro do PVP.`)}`);
      }
      if (bestKDAPlayer && bestKDAPlayer.name) {
        const kdaValue = generalBody.playerRanking?.find(p => p.name === bestKDAPlayer.name)?.kda;
        footerLines.push(`2 - ${selectPhrase('best_kda', `**${bestKDAPlayer.name}**`, kdaValue?.toFixed(2) || 'N/A', `**${bestKDAPlayer.name}** esse manja de posicionamento, KDA implacável ${kdaValue?.toFixed(2) || 'N/A'}`)}`);
      }
      if (conePlayer && conePlayer.name) {
        footerLines.push(`3 - ${selectPhrase('cone', `**${conePlayer.name}**`, String(conePlayer.deaths), `**${conePlayer.name}** Esse deve estar jogando sem mouse! morreu ${conePlayer.deaths} vezes!`)}`);
      }
      const footerMessage = footerLines.join('\n');
      
      const embed1 = {
        title: rankingTitle,
        color: isThrone ? 0xF59E0B : 0x10B981, // Amarelo para throne, verde para boss
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: formatFilters(body.filters),
            inline: false
          },
          {
            name: reiTitle,
            value: `**${generalBody.specialRankings.reiDoPVP.name}**\n${generalBody.specialRankings.reiDoPVP.kills} kills • ${generalBody.specialRankings.reiDoPVP.deaths} deaths`,
            inline: true
          },
          {
            name: '⚡ Brabissimo',
            value: `**${generalBody.specialRankings.brabissimo.name}**\n${generalBody.specialRankings.brabissimo.singleMatchKills} kills em 1 partida`,
            inline: true
          },
          {
            name: '🍦 Cone Monodedo',
            value: `**${generalBody.specialRankings.coneMonodedo.name}**\n${generalBody.specialRankings.coneMonodedo.deaths} deaths`,
            inline: true
          },
          {
            name: '📈 Totais',
            value: `${generalBody.totals.playerCount} jogadores • ${generalBody.totals.kills} kills • ${generalBody.totals.deaths} deaths`,
            inline: false
          },
          {
            name: '⚔️ Ranking por Guild',
            value: generalBody.guildRanking && generalBody.guildRanking.length > 0
              ? '```\n' + formatGuildRankingTable(generalBody.guildRanking).substring(0, 1000) + '\n```'
              : Object.entries(generalBody.guildSummary)
                  .sort((a, b) => b[1] - a[1])
                  .map(([guild, count]) => `**${guild}**: ${count} ${count === 1 ? 'jogador' : 'jogadores'}`)
                  .join('\n') || 'Nenhuma guild registrada',
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      };
      
      // Embed with player ranking table (text format)
      const embed2 = generalBody.playerRanking && generalBody.playerRanking.length > 0
        ? {
            description: '```\n' + formatRankingTable(generalBody.playerRanking).substring(0, 4000) + '\n```',
            color: isThrone ? 0xF59E0B : 0x10B981
          }
        : null;
      
      // Build link with date/hour filters
      const frontendUrl = 'https://rankingpvpboss.lovable.app';
      const tabParam = isThrone ? 'throne' : 'ranking';
      const dateParam = body.filters.dateFrom || '';
      const hourParam = body.filters.hourFrom !== undefined ? body.filters.hourFrom : '';
      const linkParts = [`tab=${tabParam}`];
      if (dateParam) linkParts.push(`date=${dateParam}`);
      if (hourParam !== '') linkParts.push(`hour=${hourParam}`);
      const rankingLink = `${frontendUrl}/?${linkParts.join('&')}`;

      const embed3 = {
        description: `${footerMessage}\n\n🔗 **[Ver ranking completo no site](${rankingLink})**`,
        color: 0x9b87f5
      };
      
      embeds = [embed1, embed2, embed3].filter(Boolean);
    }

    formData.append('payload_json', JSON.stringify({ embeds }));

    console.log('Sending to Discord...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord API error:', errorText);
      throw new Error(`Discord API error: ${response.status} ${errorText}`);
    }

    console.log('Successfully posted ranking to Discord');

    // After posting general ranking, also post filtered LEGENDS/iLEGENDS ranking
    if (rankingType === 'general') {
      const legendsWebhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL_LEGENDS');
      if (legendsWebhookUrl) {
        try {
          const genBody = body as GeneralRankingBody;
          const legendsGuilds = ['LEGENDS', 'iLEGENDS'];
          
          // Filter players by guild
          const legendsPlayers = (genBody.playerRanking || []).filter(p => {
            // We need guild info - fetch from guildRanking or characters
            // playerRanking doesn't have guild, so we need to cross-reference
            return true; // placeholder - will filter below
          });

          // We need to get guild info for each player from the characters table
          const serviceClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          );
          
          const { data: legendsChars } = await serviceClient
            .from('characters')
            .select('name, guild')
            .in('guild', legendsGuilds);
          
          const legendsNames = new Set((legendsChars || []).map(c => c.name));
          
          const filteredPlayers = (genBody.playerRanking || []).filter(p => legendsNames.has(p.name));
          
          if (filteredPlayers.length > 0) {
            const legendsTable = formatRankingTable(filteredPlayers);
            
            const legendsEmbeds = [
              {
                title: '⚔️ Ranking LEGENDS & iLEGENDS',
                description: `Desempenho dos membros das guilds LEGENDS e iLEGENDS`,
                color: 0xFFD700,
                fields: [
                  {
                    name: '🔍 Filtros Aplicados',
                    value: formatFilters(genBody.filters),
                    inline: false
                  },
                  {
                    name: '📈 Totais',
                    value: `${filteredPlayers.length} jogadores`,
                    inline: false
                  }
                ],
                timestamp: new Date().toISOString()
              },
              {
                description: '```\n' + legendsTable.substring(0, 4000) + '\n```',
                color: 0xFFD700
              }
            ];

            const legendsFormData = new FormData();
            legendsFormData.append('payload_json', JSON.stringify({ embeds: legendsEmbeds }));

            const legendsResponse = await fetch(legendsWebhookUrl, {
              method: 'POST',
              body: legendsFormData,
            });

            if (!legendsResponse.ok) {
              const errText = await legendsResponse.text();
              console.error('Discord LEGENDS webhook error:', errText);
            } else {
              console.log(`Successfully posted LEGENDS ranking (${filteredPlayers.length} players) to Discord`);
            }
          } else {
            console.log('No LEGENDS/iLEGENDS players found in ranking, skipping legends webhook');
          }
        } catch (legendsError: any) {
          console.error('Error posting LEGENDS ranking:', legendsError.message);
          // Don't fail the main request
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        playerCount: (body as any).totals?.playerCount || (body as any).totals?.relationCount || 0
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error posting to Discord:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function formatFilters(filters: Filters): string {
  const parts = [];
  
  if (filters.class && filters.class !== 'all') {
    parts.push(`Classe: **${filters.class}**`);
  }
  
  if (filters.dateFrom && filters.dateTo) {
    parts.push(`Período: **${filters.dateFrom}** até **${filters.dateTo}**`);
  } else if (filters.dateFrom) {
    parts.push(`A partir de: **${filters.dateFrom}**`);
  } else if (filters.dateTo) {
    parts.push(`Até: **${filters.dateTo}**`);
  }
  
  if (filters.hourFrom !== undefined && filters.hourTo !== undefined) {
    parts.push(`Hora: **${filters.hourFrom}:00** - **${filters.hourTo}:00**`);
  } else if (filters.hourFrom !== undefined) {
    parts.push(`Hora inicial: **${filters.hourFrom}:00**`);
  } else if (filters.hourTo !== undefined) {
    parts.push(`Hora final: **${filters.hourTo}:00**`);
  }
  
  if (filters.sortBy) {
    const sortLabels: Record<string, string> = {
      kills: 'Kills',
      deaths: 'Deaths',
      kda: 'KDA',
      weightedKda: 'KDA/Médio'
    };
    parts.push(`Ordenação: **${sortLabels[filters.sortBy] || filters.sortBy}**`);
  }
  
  return parts.length > 0 ? parts.join('\n') : 'Sem filtros aplicados';
}
