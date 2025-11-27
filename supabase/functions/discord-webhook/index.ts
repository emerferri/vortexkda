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
  guildSummary: Record<string, number>;
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

type RequestBody = GeneralRankingBody | KillStreakBody;

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
    
    // Get Discord webhook URL from environment secrets
    const webhookUrl = body.environment === 'prod' 
      ? Deno.env.get('DISCORD_WEBHOOK_URL_PROD')
      : Deno.env.get('DISCORD_WEBHOOK_URL');
    
    if (!webhookUrl) {
      throw new Error(`Webhook URL not configured for ${body.environment} environment`);
    }
    
    console.log(`Publishing to ${body.environment} environment`);

    // Validar se as imagens existem
    if (!body.image || typeof body.image !== 'string') {
      throw new Error('Image data is missing or invalid');
    }

    // Para ranking geral, validar cards especiais
    if (rankingType === 'general') {
      const generalBody = body as GeneralRankingBody;
      if (!generalBody.specialCardsImage || typeof generalBody.specialCardsImage !== 'string') {
        throw new Error('Special cards image data is missing or invalid');
      }
    }

    console.log('Image data size:', body.image.length, 'characters');

    // Converter base64 para blob - Imagem principal
    let base64Data: string;
    let imageBuffer: Uint8Array;
    
    try {
      base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
      
      if (!base64Data || base64Data.length === 0) {
        throw new Error('Base64 data is empty after removing prefix');
      }
      
      console.log('Base64 data size:', base64Data.length, 'characters');
      
      imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      console.log('Image buffer size:', imageBuffer.length, 'bytes', `(${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      
      if (imageBuffer.length > 8 * 1024 * 1024) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 8MB)`);
      }
    } catch (conversionError: any) {
      console.error('Error converting image:', conversionError);
      throw new Error(`Failed to process image: ${conversionError.message}`);
    }

    // Criar FormData
    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
    
    // Criar embeds baseado no tipo
    let embeds: any[];
    
    if (rankingType === 'killstreak') {
      const killStreakBody = body as KillStreakBody;
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
      // Ranking Geral
      const generalBody = body as GeneralRankingBody;
      
      // Converter special cards image
      let specialCardsBase64Data: string;
      let specialCardsImageBuffer: Uint8Array;
      
      try {
        specialCardsBase64Data = generalBody.specialCardsImage.replace(/^data:image\/\w+;base64,/, '');
        
        if (!specialCardsBase64Data || specialCardsBase64Data.length === 0) {
          throw new Error('Special cards base64 data is empty');
        }
        
        specialCardsImageBuffer = Uint8Array.from(atob(specialCardsBase64Data), c => c.charCodeAt(0));
        
        if (specialCardsImageBuffer.length > 8 * 1024 * 1024) {
          throw new Error(`Special cards image too large: ${(specialCardsImageBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        }
      } catch (conversionError: any) {
        console.error('Error converting special cards image:', conversionError);
        throw new Error(`Failed to process special cards image: ${conversionError.message}`);
      }
      
      formData.append('file1', blob, 'ranking.jpg');
      const specialCardsBlob = new Blob([specialCardsImageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
      formData.append('file2', specialCardsBlob, 'special-rankings.jpg');
      
      const embed1 = {
        title: '📊 Ranking BOSS Diário',
        color: 0x10B981,
        fields: [
          {
            name: '🔍 Filtros Aplicados',
            value: formatFilters(body.filters),
            inline: false
          },
          {
            name: '👑 Rei do PVP',
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
            name: '⚔️ Resumo por Guild',
            value: Object.entries(generalBody.guildSummary)
              .sort((a, b) => b[1] - a[1])
              .map(([guild, count]) => `**${guild}**: ${count} ${count === 1 ? 'jogador' : 'jogadores'}`)
              .join('\n') || 'Nenhuma guild registrada',
            inline: false
          }
        ],
        image: {
          url: 'attachment://special-rankings.jpg'
        },
        timestamp: new Date().toISOString()
      };
      
      const embed2 = {
        image: {
          url: 'attachment://ranking.jpg'
        }
      };
      
      const embed3 = {
        description: `Esse é o resultado do BOSSx2 diário! **${generalBody.specialRankings.reiDoPVP.name}** Amassou hoje, já nosso amigo **${generalBody.specialRankings.coneMonodedo.name}** passou fome!`,
        color: 0x9b87f5
      };
      
      embeds = [embed1, embed2, embed3];
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

    return new Response(
      JSON.stringify({ 
        success: true,
        playerCount: body.totals.playerCount 
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
