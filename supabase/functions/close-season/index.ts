import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RANKING_LABELS: Record<string, string> = {
  geral: '👑 Ranking Geral',
  reis_pvp: '🤴 Reis do PVP',
  cones: '💩 Cones Monodedo',
  kill_streak: '🔥 Kill Streak',
  mural_vergonha: '☠️ Mural da Vergonha',
  fogo_amigo: '🤝 Fogo Amigo',
  putinha: '🍑 Minha Putinha',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: closeData, error: closeErr } = await supabase.rpc('close_current_season');
    if (closeErr) throw closeErr;

    const result = Array.isArray(closeData) ? closeData[0] : closeData;
    const closedId: string | null = result?.closed_season_id ?? null;
    const newId: string | null = result?.new_season_id ?? null;

    let discordPosted = false;

    if (closedId) {
      const [{ data: season }, { data: snaps }] = await Promise.all([
        supabase.from('seasons').select('name, year, month').eq('id', closedId).maybeSingle(),
        supabase.from('season_snapshots').select('*').eq('season_id', closedId).order('ranking_type').order('position'),
      ]);

      const webhook = Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
      const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

      if (webhook && !paused && snaps && snaps.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const s of snaps) {
          (grouped[s.ranking_type] ||= []).push(s);
        }

        const sections: string[] = [];
        for (const [type, label] of Object.entries(RANKING_LABELS)) {
          const list = grouped[type];
          if (!list || list.length === 0) continue;
          const lines = list.slice(0, 10).map((s) => {
            const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : `#${s.position}`;
            return `${medal} ${s.player_name}${s.player_class ? ` (${s.player_class})` : ''} — ${Number(s.score).toFixed(2)}`;
          });
          sections.push(`**${label}**\n${lines.join('\n')}`);
        }

        const content = `🏆 **HALL DA FAMA — ${season?.name ?? 'Temporada'}** 🏆\n\n${sections.join('\n\n')}`;
        const chunks: string[] = [];
        let buf = '';
        for (const part of content.split('\n')) {
          if ((buf + '\n' + part).length > 1900) {
            chunks.push(buf);
            buf = part;
          } else {
            buf = buf ? `${buf}\n${part}` : part;
          }
        }
        if (buf) chunks.push(buf);

        for (const c of chunks) {
          await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: c }),
          });
        }
        discordPosted = true;
      }
    }

    return new Response(
      JSON.stringify({ success: true, closed_season_id: closedId, new_season_id: newId, snapshots: result?.snapshots_created ?? 0, discord_posted: discordPosted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
