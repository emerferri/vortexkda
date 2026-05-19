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

function buildDiscordChunks(seasonName: string, grouped: Record<string, any[]>, prefix = '') {
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
  const content = `${prefix}🏆 **HALL DA FAMA — ${seasonName}** 🏆\n\n${sections.join('\n\n')}`;
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
  return chunks;
}

async function postChunks(webhook: string, chunks: string[]) {
  for (const c of chunks) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: c }),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse optional body
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const preview: boolean = body?.preview === true;
    const target: 'prod' | 'homolog' = body?.target === 'homolog' ? 'homolog' : 'prod';

    // ===== PREVIEW MODE: não fecha temporada, gera snapshot temporário e posta no webhook escolhido =====
    if (preview) {
      // Pega temporada ativa
      const { data: active, error: actErr } = await supabase
        .from('seasons')
        .select('id, name, started_at')
        .eq('status', 'active')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (actErr) throw actErr;
      if (!active) throw new Error('Nenhuma temporada ativa encontrada');

      const today = new Date().toISOString().slice(0, 10);
      const dateFrom = active.started_at;

      // Roda os mesmos RPCs do close_current_season, em memória
      const [geral, reis, killStreak, mural, fogo, putinha] = await Promise.all([
        supabase.rpc('get_ranking_geral', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null }),
        supabase.rpc('get_ranking_reis_pvp', { p_date_from: dateFrom, p_date_to: today, p_event_type: 'boss_event' }),
        supabase.rpc('get_ranking_kill_streak', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
        supabase.rpc('get_ranking_mural_vergonha', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
        supabase.rpc('get_ranking_fogo_amigo', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
        supabase.rpc('get_ranking_putinha', { p_date_from: dateFrom, p_date_to: today, p_hour_from: null, p_hour_to: null, p_event_type: 'boss_event' }),
      ]);

      const grouped: Record<string, any[]> = {};

      const geralRows = (geral.data || []).slice()
        .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.event_score }));
      grouped['geral'] = geralRows;

      const reisRows = (reis.data || []).filter((r: any) => r.is_rei)
        .sort((a: any, b: any) => Number(b.vezes) - Number(a.vezes) || Number(b.melhor_score) - Number(a.melhor_score))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, score: r.melhor_score }));
      grouped['reis_pvp'] = reisRows;

      const conesRows = (reis.data || []).filter((r: any) => !r.is_rei)
        .sort((a: any, b: any) => Number(b.vezes) - Number(a.vezes) || Number(a.pior_score) - Number(b.pior_score))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, score: r.pior_score }));
      grouped['cones'] = conesRows;

      const ksRows = (killStreak.data || []).slice()
        .sort((a: any, b: any) => Number(b.max_streak) - Number(a.max_streak))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.max_streak }));
      grouped['kill_streak'] = ksRows;

      const muralRows = (mural.data || []).slice()
        .sort((a: any, b: any) => Number(b.total_deaths) - Number(a.total_deaths))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.total_deaths }));
      grouped['mural_vergonha'] = muralRows;

      const fogoRows = (fogo.data || []).slice()
        .sort((a: any, b: any) => Number(b.event_score) - Number(a.event_score))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: r.player_name, player_class: r.player_class, score: r.event_score }));
      grouped['fogo_amigo'] = fogoRows;

      const putRows = (putinha.data || []).slice()
        .sort((a: any, b: any) => Number(b.deaths) - Number(a.deaths))
        .slice(0, 10)
        .map((r: any, i: number) => ({ position: i + 1, player_name: `${r.killer_name} → ${r.victim_name}`, score: r.deaths }));
      grouped['putinha'] = putRows;

      const webhook = target === 'prod'
        ? Deno.env.get('DISCORD_WEBHOOK_URL_PROD')
        : Deno.env.get('DISCORD_WEBHOOK_URL');

      if (!webhook) throw new Error(`Webhook ${target} não configurado`);

      const prefix = target === 'homolog' ? '🧪 **[PREVIEW / HOMOLOG]**\n' : '';
      const chunks = buildDiscordChunks(active.name + ' (preview)', grouped, prefix);
      await postChunks(webhook, chunks);

      const totalRows = Object.values(grouped).reduce((acc, l) => acc + l.length, 0);
      return new Response(
        JSON.stringify({ success: true, preview: true, target, season: active.name, snapshots: totalRows, discord_posted: true, grouped }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== Fluxo normal: fecha temporada =====
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

      const webhook = target === 'homolog'
        ? Deno.env.get('DISCORD_WEBHOOK_URL')
        : Deno.env.get('DISCORD_WEBHOOK_URL_PROD');
      const paused = Deno.env.get('AUTO_POST_PAUSED') === 'true';

      if (webhook && !paused && snaps && snaps.length > 0) {
        const grouped: Record<string, any[]> = {};
        for (const s of snaps) {
          (grouped[s.ranking_type] ||= []).push(s);
        }
        const prefix = target === 'homolog' ? '🧪 **[HOMOLOG]**\n' : '';
        const chunks = buildDiscordChunks(season?.name ?? 'Temporada', grouped, prefix);
        await postChunks(webhook, chunks);
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
