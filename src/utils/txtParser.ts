import { PlayerStats } from '@/components/Scoreboard';

export const parseTxtFile = (content: string): PlayerStats[] => {
  const lines = content.split('\n').filter(line => line.trim());
  const playerMap = new Map<string, { kills: number; deaths: number }>();

  lines.forEach(line => {
    // Pattern: :dagger: KillerName matou :skull: VictimName
    const killMatch = line.match(/:dagger:\s*(\w+)\s+matou\s+:skull:\s*(\w+)/i);
    
    if (killMatch) {
      const killer = killMatch[1].trim();
      const victim = killMatch[2].trim();

      // Update killer stats
      const killerStats = playerMap.get(killer) || { kills: 0, deaths: 0 };
      killerStats.kills += 1;
      playerMap.set(killer, killerStats);

      // Update victim stats
      const victimStats = playerMap.get(victim) || { kills: 0, deaths: 0 };
      victimStats.deaths += 1;
      playerMap.set(victim, victimStats);
    }
  });

  // Convert to array and calculate KDA
  const players: PlayerStats[] = Array.from(playerMap.entries()).map(([name, stats]) => ({
    name,
    kills: stats.kills,
    deaths: stats.deaths,
    kda: stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths,
  }));

  return players;
};
