import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpecialRankings {
  reiDoPVP: { name: string; kills: number; deaths: number; matches: number };
  brabissimo: { name: string; singleMatchKills: number; matches: number };
  coneMonodedo: { name: string; deaths: number; matches: number };
}

interface Filters {
  class: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number;
  hourTo?: number;
  sortBy: string;
}

interface RequestBody {
  environment: 'homolog' | 'prod';
  webhookUrl: string;
  filters: Filters;
  specialRankings: SpecialRankings;
  image: string; // Base64 image data
  specialCardsImage: string; // Base64 image data for special cards
  totals: {
    kills: number;
    deaths: number;
    playerCount: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    console.log('Received request to post ranking to Discord');
    
    // Get Discord webhook URL from request body
    const webhookUrl = body.webhookUrl;
    
    if (!webhookUrl) {
      throw new Error(`Webhook URL not provided for ${body.environment} environment`);
    }
    
    console.log(`Publishing to ${body.environment} environment`);

    // Validar se as imagens existem
    if (!body.image || typeof body.image !== 'string') {
      throw new Error('Table image data is missing or invalid');
    }
    if (!body.specialCardsImage || typeof body.specialCardsImage !== 'string') {
      throw new Error('Special cards image data is missing or invalid');
    }

    console.log('Table image data size:', body.image.length, 'characters');
    console.log('Special cards image data size:', body.specialCardsImage.length, 'characters');

    // Converter base64 para blob - Tabela
    let base64Data: string;
    let imageBuffer: Uint8Array;
    
    try {
      base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
      
      if (!base64Data || base64Data.length === 0) {
        throw new Error('Base64 data is empty after removing prefix');
      }
      
      console.log('Table base64 data size:', base64Data.length, 'characters');
      
      imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      console.log('Table image buffer size:', imageBuffer.length, 'bytes', `(${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      
      // Verificar se não ultrapassa 8MB (limite do Discord)
      if (imageBuffer.length > 8 * 1024 * 1024) {
        throw new Error(`Table image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 8MB)`);
      }
    } catch (conversionError: any) {
      console.error('Error converting table image:', conversionError);
      throw new Error(`Failed to process table image: ${conversionError.message}`);
    }

    // Converter base64 para blob - Cards Especiais
    let specialCardsBase64Data: string;
    let specialCardsImageBuffer: Uint8Array;
    
    try {
      specialCardsBase64Data = body.specialCardsImage.replace(/^data:image\/\w+;base64,/, '');
      
      if (!specialCardsBase64Data || specialCardsBase64Data.length === 0) {
        throw new Error('Special cards base64 data is empty after removing prefix');
      }
      
      console.log('Special cards base64 data size:', specialCardsBase64Data.length, 'characters');
      
      specialCardsImageBuffer = Uint8Array.from(atob(specialCardsBase64Data), c => c.charCodeAt(0));
      console.log('Special cards image buffer size:', specialCardsImageBuffer.length, 'bytes', `(${(specialCardsImageBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      
      // Verificar se não ultrapassa 8MB (limite do Discord)
      if (specialCardsImageBuffer.length > 8 * 1024 * 1024) {
        throw new Error(`Special cards image too large: ${(specialCardsImageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 8MB)`);
      }
    } catch (conversionError: any) {
      console.error('Error converting special cards image:', conversionError);
      throw new Error(`Failed to process special cards image: ${conversionError.message}`);
    }
    
    // Criar FormData para enviar as imagens
    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
    formData.append('file1', blob, 'ranking.jpg');
    
    const specialCardsBlob = new Blob([specialCardsImageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
    formData.append('file2', specialCardsBlob, 'special-rankings.jpg');

    // Criar embed com informações resumidas
    const embed = {
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
          value: `**${body.specialRankings.reiDoPVP.name}**\n${body.specialRankings.reiDoPVP.kills} kills • ${body.specialRankings.reiDoPVP.deaths} deaths`,
          inline: true
        },
        {
          name: '⚡ Brabissimo',
          value: `**${body.specialRankings.brabissimo.name}**\n${body.specialRankings.brabissimo.singleMatchKills} kills em 1 partida`,
          inline: true
        },
        {
          name: '🍦 Cone Monodedo',
          value: `**${body.specialRankings.coneMonodedo.name}**\n${body.specialRankings.coneMonodedo.deaths} deaths`,
          inline: true
        },
        {
          name: '📈 Totais',
          value: `${body.totals.playerCount} jogadores • ${body.totals.kills} kills • ${body.totals.deaths} deaths`,
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

    // Terceiro embed com a mensagem final (aparece abaixo das imagens)
    const embed3 = {
      description: `Essas foram as kill's de Hoje pessoal <@Hard> ! **${body.specialRankings.reiDoPVP.name}** Amassou hoje, já nosso amigo **${body.specialRankings.coneMonodedo.name}** passou fome.`,
      color: 0x9b87f5
    };

    formData.append('payload_json', JSON.stringify({ 
      embeds: [embed, embed2, embed3] 
    }));

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
  
  if (filters.class !== 'all') {
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
  
  const sortLabels: Record<string, string> = {
    kills: 'Kills',
    deaths: 'Deaths',
    kda: 'KDA',
    weightedKda: 'KDA/Médio'
  };
  parts.push(`Ordenação: **${sortLabels[filters.sortBy] || filters.sortBy}**`);
  
  return parts.length > 0 ? parts.join('\n') : 'Sem filtros aplicados';
}
