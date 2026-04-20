import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [activeTab, setActiveTab] = useState('players');

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

        {/*
          Lazy-mount: render ONLY the active tab. This avoids 7 simultaneous
          queries / heavy aggregations when the dashboard opens. The shared
          useAnalyticsDataset cache means switching tabs is instant after the
          first load.
        */}
        <div className="mt-4">
          {activeTab === 'players' && <PlayerAnalytics filters={filters} />}
          {activeTab === 'guilds' && <GuildAnalytics filters={filters} />}
          {activeTab === 'pvp' && <DirectCombat filters={filters} />}
          {activeTab === 'classes' && <ClassAnalytics filters={filters} />}
          {activeTab === 'charts' && <AnalyticsCharts filters={filters} />}
          {activeTab === 'team' && <TeamBuilder filters={filters} />}
          {activeTab === 'insights' && <AIInsights filters={filters} />}
        </div>
      </Tabs>
    </div>
  );
};
