import { useQuery } from '@tanstack/react-query';
import {
  AnalyticsFilters,
  fetchFilteredMatchIds,
  fetchKillLogsForMatches,
  fetchAllCharacters,
  fetchMatchesWithType,
  buildCharacterMap,
  filterBanned,
  filterByGuild,
  KillLog,
  CharacterInfo,
  MatchWithType,
} from './useAnalyticsData';

export interface AnalyticsDataset {
  /** All matches matching the filters (id + event_type + match_date). */
  matches: MatchWithType[];
  /** Match ids only (subset of matches.map(m=>m.id)). */
  matchIds: string[];
  /** Map matchId -> match_date (ISO). */
  matchDateMap: Map<string, string>;
  /** Map matchId -> event_type. */
  matchTypeMap: Map<string, string>;
  /** All characters in the DB (cache). */
  characters: CharacterInfo[];
  /** name -> CharacterInfo. */
  charMap: Map<string, CharacterInfo>;
  /**
   * Kill logs already filtered by:
   *  - banned characters removed (killer or victim)
   *  - guild filter applied
   * Class filter is intentionally NOT applied here so consumers (e.g. ClassAnalytics)
   * can still see cross-class data; apply filterByClass downstream when needed.
   */
  logs: KillLog[];
}

/**
 * Stable, normalized cache key — avoids React Query refetching when an
 * equivalent filters object is recreated by a parent re-render.
 */
function filtersKey(f: AnalyticsFilters): string {
  return JSON.stringify({
    d1: f.dateFrom,
    d2: f.dateTo,
    h1: f.hourFrom,
    h2: f.hourTo,
    e: f.eventType,
    g: f.guild,
    c: f.playerClass,
    // playerName is a UI-only filter (search inside Players tab), do not
    // include it here — otherwise typing in the search box would refetch
    // the entire dataset.
  });
}

/**
 * Single source of truth for the analytics dashboard. All tabs (Players,
 * Guilds, Classes, PvP, Charts, AI Insights, Team Builder) share this cache,
 * so switching tabs is instant and we only fetch each underlying table once.
 */
export function useAnalyticsDataset(filters: AnalyticsFilters) {
  return useQuery<AnalyticsDataset>({
    queryKey: ['analytics-dataset', filtersKey(filters)],
    staleTime: 5 * 60 * 1000, // 5 min — analytics data is not edited live
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      // Fetch matches (with type+date) and characters in parallel.
      const [matches, characters] = await Promise.all([
        fetchMatchesWithType(filters),
        fetchAllCharacters(),
      ]);

      const charMap = buildCharacterMap(characters);
      const matchIds = matches.map((m) => m.id);

      const matchDateMap = new Map<string, string>();
      const matchTypeMap = new Map<string, string>();
      for (const m of matches) {
        matchDateMap.set(m.id, m.match_date);
        matchTypeMap.set(m.id, m.event_type);
      }

      let logs = await fetchKillLogsForMatches(matchIds);
      logs = filterBanned(logs, charMap);
      logs = filterByGuild(logs, filters.guild, charMap);

      return {
        matches,
        matchIds,
        matchDateMap,
        matchTypeMap,
        characters,
        charMap,
        logs,
      };
    },
  });
}
