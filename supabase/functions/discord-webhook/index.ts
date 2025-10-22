import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpecialRankings {
  reiDoPVP: { name: string; kills: number; matches: number };
  brabissimo: { name: string; kda: number; matches: number };
  melhorPonderado: { name: string; weightedKda: number; matches: number };
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
  filters: Filters;
  specialRankings: SpecialRankings;
  image: string; // Base64 image data
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
    const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
    if (!webhookUrl) {
      throw new Error('DISCORD_WEBHOOK_URL not configured');
    }

    const body: RequestBody = await req.json();
    console.log('Received request to post ranking to Discord');

    // Validar se a imagem existe
    if (!body.image || typeof body.image !== 'string') {
      throw new Error('Image data is missing or invalid');
    }

    console.log('Image data size:', body.image.length, 'characters');

    // Converter base64 para blob com validação
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
      
      // Verificar se não ultrapassa 8MB (limite do Discord)
      if (imageBuffer.length > 8 * 1024 * 1024) {
        throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 8MB)`);
      }
    } catch (conversionError: any) {
      console.error('Error converting image:', conversionError);
      throw new Error(`Failed to process image: ${conversionError.message}`);
    }
    
    // Criar FormData para enviar a imagem
    const formData = new FormData();
    const blob = new Blob([imageBuffer as unknown as BlobPart], { type: 'image/jpeg' });
    formData.append('file', blob, 'ranking.jpg');

    // Criar embed com informações resumidas
    const embed = {
      title: '📊 Ranking Geral PVP',
      color: 0x10B981,
      fields: [
        {
          name: '🔍 Filtros Aplicados',
          value: formatFilters(body.filters),
          inline: false
        },
        {
          name: '👑 Rei do PVP',
          value: `**${body.specialRankings.reiDoPVP.name}**\n${body.specialRankings.reiDoPVP.kills} kills`,
          inline: true
        },
        {
          name: '⚡ Brabissimo',
          value: `**${body.specialRankings.brabissimo.name}**\nKDA: ${body.specialRankings.brabissimo.kda.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 Melhor KDA Ponderado',
          value: `**${body.specialRankings.melhorPonderado.name}**\n${body.specialRankings.melhorPonderado.weightedKda.toFixed(2)}`,
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
        url: 'attachment://ranking.jpg'
      },
      timestamp: new Date().toISOString()
    };

    formData.append('payload_json', JSON.stringify({ embeds: [embed] }));

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
    weightedKda: 'KDA Ponderado'
  };
  parts.push(`Ordenação: **${sortLabels[filters.sortBy] || filters.sortBy}**`);
  
  return parts.length > 0 ? parts.join('\n') : 'Sem filtros aplicados';
}
