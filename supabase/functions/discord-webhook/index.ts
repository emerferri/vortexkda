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

interface Player {
  name: string;
  class: string | null;
  kills: number;
  deaths: number;
  kda: number;
  weightedKda: number;
  matches: number;
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
  players: Player[];
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
    console.log('Player count:', body.players.length);

    // Criar embed principal com informações especiais
    const mainEmbed = {
      title: '📊 Ranking Geral PVP',
      color: 0x10B981, // Verde
      fields: [
        {
          name: '🔍 Filtros Aplicados',
          value: formatFilters(body.filters),
          inline: false
        },
        {
          name: '👑 Rei do PVP (Mais Kills)',
          value: `**${body.specialRankings.reiDoPVP.name}**\n${body.specialRankings.reiDoPVP.kills} kills • ${body.specialRankings.reiDoPVP.matches} boss(es)`,
          inline: true
        },
        {
          name: '⚡ Brabissimo (Melhor KDA)',
          value: `**${body.specialRankings.brabissimo.name}**\nKDA: ${body.specialRankings.brabissimo.kda.toFixed(2)} • ${body.specialRankings.brabissimo.matches} boss(es)`,
          inline: true
        },
        {
          name: '📊 Melhor KDA Ponderado',
          value: `**${body.specialRankings.melhorPonderado.name}**\nKDA Pond.: ${body.specialRankings.melhorPonderado.weightedKda.toFixed(2)} • ${body.specialRankings.melhorPonderado.matches} boss(es)`,
          inline: true
        },
        {
          name: '🍦 Cone Monodedo (Mais Deaths)',
          value: `**${body.specialRankings.coneMonodedo.name}**\n${body.specialRankings.coneMonodedo.deaths} deaths • ${body.specialRankings.coneMonodedo.matches} boss(es)`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    // Criar embeds com os jogadores (máximo 25 por embed devido ao limite do Discord)
    const playerEmbeds = [];
    const playersPerEmbed = 25;
    
    for (let i = 0; i < body.players.length; i += playersPerEmbed) {
      const chunk = body.players.slice(i, i + playersPerEmbed);
      const startRank = i + 1;
      
      // Formatar jogadores em uma tabela
      const playersText = chunk.map((player, idx) => {
        const rank = startRank + idx;
        const className = player.class || 'N/A';
        return `\`${rank.toString().padStart(3, ' ')}.\` **${player.name}** (${className})\n` +
               `      ⚔️ ${player.kills} | 💀 ${player.deaths} | 📈 ${player.kda.toFixed(2)}`;
      }).join('\n\n');

      playerEmbeds.push({
        title: i === 0 ? '🏆 Ranking Completo' : `🏆 Ranking (continuação)`,
        description: playersText,
        color: 0x3B82F6, // Azul
        footer: i + playersPerEmbed >= body.players.length ? {
          text: `Total: ${body.totals.playerCount} jogadores • ${body.totals.kills} kills • ${body.totals.deaths} deaths`
        } : undefined
      });
    }

    // Discord limita a 10 embeds por mensagem
    // Se tiver mais que 10 embeds, precisamos enviar múltiplas mensagens
    const allEmbeds = [mainEmbed, ...playerEmbeds];
    const messages = [];
    
    for (let i = 0; i < allEmbeds.length; i += 10) {
      messages.push({
        embeds: allEmbeds.slice(i, i + 10)
      });
    }

    // Enviar todas as mensagens
    for (let i = 0; i < messages.length; i++) {
      console.log(`Sending message ${i + 1}/${messages.length}`);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages[i]),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Discord API error:', errorText);
        throw new Error(`Discord API error: ${response.status} ${errorText}`);
      }

      // Aguardar 1 segundo entre mensagens para evitar rate limit
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('Successfully posted ranking to Discord');

    return new Response(
      JSON.stringify({ 
        success: true, 
        messagesCount: messages.length,
        playersCount: body.players.length 
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
