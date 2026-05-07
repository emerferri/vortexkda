import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: newOnes, error } = await supabase.rpc('check_player_milestones');
    if (error) throw error;

    const list = (newOnes || []) as Array<{ player_name: string; metric: string; threshold: number; label: string; emoji: string }>;
    let posted = 0;

    if (list.length > 0) {
      const webhook = Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
      const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

      if (webhook && !paused) {
        const lines = list.map((m) => `${m.emoji} **${m.player_name}** conquistou **${m.label}**!`);
        const header = `🎖️ **NOVOS MARCOS ALCANÇADOS** 🎖️\n\n`;

        const chunks: string[] = [];
        let buf = header;
        for (const line of lines) {
          if ((buf + '\n' + line).length > 1900) {
            chunks.push(buf);
            buf = line;
          } else {
            buf = buf === header ? buf + line : buf + '\n' + line;
          }
        }
        if (buf.trim()) chunks.push(buf);

        for (const c of chunks) {
          const r = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: c }),
          });
          if (r.ok) posted++;
        }

        // Mark as notified
        const ids = list.map((m) => `${m.player_name}|${m.metric}|${m.threshold}`);
        for (const m of list) {
          await supabase
            .from('player_milestones')
            .update({ notified: true })
            .eq('player_name', m.player_name)
            .eq('metric', m.metric)
            .eq('threshold', m.threshold);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, new_milestones: list.length, discord_chunks_posted: posted, milestones: list }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
