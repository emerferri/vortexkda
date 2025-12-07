import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated and has admin/moderator role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client for our internal Supabase to verify user role
    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalSupabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalSupabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await internalClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin or moderator role
    const { data: roles } = await internalClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasPermission = roles?.some(r => r.role === 'admin' || r.role === 'moderator');
    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Permission denied. Admin or moderator role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get filter parameters
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '1000');

    console.log(`Fetching external logs with filters: startDate=${startDate}, endDate=${endDate}, limit=${limit}`);

    // Connect to external Supabase
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalUrl || !externalKey) {
      return new Response(
        JSON.stringify({ error: 'External database credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const externalClient = createClient(externalUrl, externalKey);

    // Build query
    let query = externalClient
      .from('logs_pvp')
      .select('id, content, timestamp, created_at')
      .order('timestamp', { ascending: false })
      .limit(limit);

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error('Error fetching logs:', logsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch logs from external database', details: logsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully fetched ${logs?.length || 0} logs from external database`);

    return new Response(
      JSON.stringify({ logs: logs || [], count: logs?.length || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
