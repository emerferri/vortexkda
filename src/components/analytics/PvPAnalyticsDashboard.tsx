import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsFiltersBar } from './AnalyticsFilters';
import { PlayerAnalytics } from './PlayerAnalytics';
import { GuildAnalytics } from './GuildAnalytics';
import { DirectCombat } from './DirectCombat';
import { ClassAnalytics } from './ClassAnalytics';
import { AnalyticsCharts } from './AnalyticsCharts';
import { AIInsights } from './AIInsights';
import { TeamBuilder } from './TeamBuilder';
import { AnalyticsFilters, defaultFilters } from '@/hooks/useAnalyticsData';
import { BarChart3, Users, Swords, Shield, LineChart, Brain, Target } from 'lucide-react';

export const PvPAnalyticsDashboard = () => {
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Análise de Desempenho PvP
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estatísticas detalhadas de jogadores, guilds e classes
        </p>
      </div>

      <AnalyticsFiltersBar filters={filters} onChange={setFilters} />

      <Tabs defaultValue="players" className="w-full">
        <TabsList className="grid grid-cols-4 md:grid-cols-7 w-full">
          <TabsTrigger value="players" className="gap-1 text-xs">
            <Users className="w-3 h-3" /> Players
          </TabsTrigger>
          <TabsTrigger value="guilds" className="gap-1 text-xs">
            <Shield className="w-3 h-3" /> Guilds
          </TabsTrigger>
          <TabsTrigger value="pvp" className="gap-1 text-xs">
            <Swords className="w-3 h-3" /> PvP Direto
          </TabsTrigger>
          <TabsTrigger value="classes" className="gap-1 text-xs">
            <BarChart3 className="w-3 h-3" /> Classes
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1 text-xs">
            <LineChart className="w-3 h-3" /> Gráficos
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1 text-xs">
            <Target className="w-3 h-3" /> Escalação
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1 text-xs">
            <Brain className="w-3 h-3" /> Insights IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="players">
          <PlayerAnalytics filters={filters} />
        </TabsContent>
        <TabsContent value="guilds">
          <GuildAnalytics filters={filters} />
        </TabsContent>
        <TabsContent value="pvp">
          <DirectCombat filters={filters} />
        </TabsContent>
        <TabsContent value="classes">
          <ClassAnalytics filters={filters} />
        </TabsContent>
        <TabsContent value="charts">
          <AnalyticsCharts filters={filters} />
        </TabsContent>
        <TabsContent value="team">
          <TeamBuilder filters={filters} />
        </TabsContent>
        <TabsContent value="insights">
          <AIInsights filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
