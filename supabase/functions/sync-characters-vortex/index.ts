import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert character name to hexadecimal for VortexMU URL
const nameToHex = (name: string): string => {
  return Array.from(name)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
};

// Parse class from VortexMU HTML
const parseClass = (html: string): string | null => {
  // Pattern: <label class="text-white">Class</label> followed by <div>ClassName</div>
  // The HTML has whitespace/newlines between tags and content
  const classRegex = /<label[^>]*>\s*Class\s*<\/label>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/i;
  const match = html.match(classRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
};

// Parse guild from VortexMU HTML
const parseGuild = (html: string): string | null => {
  // Pattern 1: Guild with link - <label>Guild</label><div><a href="...">GuildName</a></div>
  // The HTML has whitespace/newlines between tags
  const guildLinkRegex = /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i;
  const linkMatch = html.match(guildLinkRegex);
  if (linkMatch && linkMatch[1]) {
    return linkMatch[1].trim();
  }

  // Pattern 2: No guild - <label>Guild</label><div>None</div>
  const guildNoneRegex = /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*None\s*<\/div>/i;
  if (guildNoneRegex.test(html)) {
    return "Sem Guild";
  }

  // Pattern 3: Direct text (fallback)
  const guildTextRegex = /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/i;
  const textMatch = html.match(guildTextRegex);
  if (textMatch && textMatch[1]) {
    const guild = textMatch[1].trim();
    return guild === "None" ? "Sem Guild" : guild;
  }

  return null;
};

// Normalize name: trim, collapse spaces
const normalizeName = (name: string): string => {
  return name.replace(/\s+/g, ' ').trim();
};

// Fetch character data from VortexMU
const fetchCharacterFromVortex = async (
  rawName: string
): Promise<{ class: string; guild: string } | null> => {
  const name = normalizeName(rawName);
  const hexName = nameToHex(name);
  const url = `https://vortexmu.net/character/${hexName}/MUONLINE`;

  console.log(`[Vortex] Fetching: ${name} (hex=${hexName}) -> ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      console.log(`[Vortex] HTTP ${response.status} for ${name}`);
      return null;
    }

    const html = await response.text();

    // Detect "not found" more robustly.
    // Some pages can include "404" strings in unrelated assets; don't use that.
    const hasCharacterInfo = /Character\s+Information/i.test(html);
    const hasNameBlock = new RegExp(
      `<label[^>]*>\\s*Name\\s*<\\/label>[\\s\\S]*?<div[^>]*>\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*<\\/div>`,
      "i"
    ).test(html);

    if (!hasCharacterInfo || !hasNameBlock) {
      console.log(
        `[Vortex] Character not found or blocked: ${name} (hasCharacterInfo=${hasCharacterInfo}, hasNameBlock=${hasNameBlock}, htmlLength=${html.length})`
      );
      console.log(`[Vortex] HTML snippet (first 500 chars): ${html.substring(0, 500)}`);
      return null;
    }

    const charClass = parseClass(html);
    const guild = parseGuild(html);

    if (!charClass) {
      console.log(`[Vortex] Could not parse class for: ${name}`);
      return null;
    }

    console.log(`[Vortex] Parsed ${name}: class=${charClass}, guild=${guild}`);

    return {
      class: charClass,
      guild: guild || "Sem Guild",
    };
  } catch (error) {
    console.error(`[Vortex] Error fetching ${name}:`, error);
    return null;
  }
};

// Delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create user client to verify auth
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user role (admin or moderator)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { mode, names } = body as {
      mode: "unregistered" | "all" | "selected";
      names?: string[];
    };

    console.log(`[Sync] Mode: ${mode}, Names count: ${names?.length || 0}`);

    // Get characters to sync based on mode
    let charactersToSync: string[] = [];

    if (mode === "selected" && names && names.length > 0) {
      charactersToSync = names;
    } else if (mode === "unregistered") {
      // Get all player names from matches
      const { data: players } = await supabase
        .from("pvp_match_players")
        .select("player_name");

      // Get all registered characters
      const { data: registered } = await supabase
        .from("characters")
        .select("name");

      const registeredNames = new Set(
        (registered || []).map((c) => c.name.toLowerCase())
      );
      const allPlayers = new Set(
        (players || []).map((p) => p.player_name)
      );

      charactersToSync = [...allPlayers].filter(
        (name) => !registeredNames.has(name.toLowerCase())
      );
    } else if (mode === "all") {
      // Get unique player names from matches
      const { data: players } = await supabase
        .from("pvp_match_players")
        .select("player_name");

      charactersToSync = [...new Set((players || []).map((p) => p.player_name))];
    }

    console.log(`[Sync] Characters to sync: ${charactersToSync.length}`);

    // Process characters with rate limiting
    const results = {
      total: charactersToSync.length,
      updated: 0,
      created: 0,
      failed: 0,
      notFound: 0,
      errors: [] as { name: string; error: string }[],
    };

    const BATCH_DELAY = 150; // ms between requests

    for (const name of charactersToSync) {
      try {
        const vortexData = await fetchCharacterFromVortex(name);

        if (!vortexData) {
          results.notFound++;
          results.errors.push({ name, error: "Character not found on VortexMU" });
          await delay(BATCH_DELAY);
          continue;
        }

        // Upsert character
        const { data: existing } = await supabase
          .from("characters")
          .select("id")
          .ilike("name", name)
          .maybeSingle();

        if (existing) {
          // Update existing
          const { error: updateError } = await supabase
            .from("characters")
            .update({
              class: vortexData.class,
              guild: vortexData.guild,
            })
            .eq("id", existing.id);

          if (updateError) throw updateError;
          results.updated++;
        } else {
          // Insert new
          const { error: insertError } = await supabase
            .from("characters")
            .insert({
              name,
              class: vortexData.class,
              guild: vortexData.guild,
            });

          if (insertError) throw insertError;
          results.created++;
        }

        await delay(BATCH_DELAY);
      } catch (error: any) {
        console.error(`[Sync] Error processing ${name}:`, error);
        results.failed++;
        results.errors.push({ name, error: error.message || "Unknown error" });
      }
    }

    console.log(`[Sync] Complete:`, results);

    return new Response(
      JSON.stringify({ success: true, summary: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
