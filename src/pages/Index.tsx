import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { Scoreboard, PlayerStats } from '@/components/Scoreboard';
import { RankingGeral } from '@/components/RankingGeral';
import { ClassGuildRanking } from '@/components/ClassGuildRanking';
import { PutinhaRanking } from '@/components/PutinhaRanking';
import { MuralDaVergonha } from '@/components/MuralDaVergonha';
import { KillStreakRanking } from '@/components/KillStreakRanking';
import { DatabaseManager } from '@/components/DatabaseManager';
import { DatabaseImport } from '@/components/DatabaseImport';
import { parseTxtFile, ParseResult } from '@/utils/txtParser';
import { Swords, LogIn, LogOut, User, FileText, Database } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Index = () => {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [bossLabel, setBossLabel] = useState<string | null>(null);
  const [killLogs, setKillLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('placar');
  const { user, signOut } = useAuth();
  const { isAdmin, canEditData } = useUserRole();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [importSource, setImportSource] = useState<'txt' | 'database'>('txt');

  const handleFileUpload = (content: string) => {
    const result = parseTxtFile(content);
    setPlayers(result.players);
    setBossLabel(result.bossLabel);
    setKillLogs(result.killLogs);
  };

  const handleDatabaseImport = (result: ParseResult) => {
    setPlayers(result.players);
    setBossLabel(result.bossLabel);
    setKillLogs(result.killLogs);
  };

  return (
    <div className="min-h-screen bg-background gradient-gaming">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4 relative">
            <Swords className="w-12 h-12 text-primary animate-pulse" />
            <h1 className="text-5xl font-bold text-foreground text-glow">
              Ranking de Kill - PVP BOSS
            </h1>
            <Swords className="w-12 h-12 text-primary animate-pulse" />
            
            <div className="absolute right-0 top-0">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <User className="w-4 h-4" />
                      {user.email?.split('@')[0]}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate('/auth')}
                  className="gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </Button>
              )}
            </div>
          </div>
          <p className="text-lg text-muted-foreground">
            Aqui separamos os homens das crianças, quem é superior no pvp? quem mais se destaca?
          </p>
        </header>

        <div className="space-y-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full max-w-6xl mx-auto ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} mb-8`}>
              <TabsTrigger value="placar" className="text-base font-semibold">
                Incluir Dados
              </TabsTrigger>
              <TabsTrigger value="ranking" className="text-base font-semibold">
                Ranking Geral
              </TabsTrigger>
              <TabsTrigger value="classe-guild" className="text-base font-semibold">
                Classe/Guild
              </TabsTrigger>
              <TabsTrigger value="putinha" className="text-base font-semibold">
                Minha Putinha
              </TabsTrigger>
              <TabsTrigger value="vergonha" className="text-base font-semibold">
                Mural da Vergonha
              </TabsTrigger>
              <TabsTrigger value="killstreak" className="text-base font-semibold">
                Kill Streak
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="text-base font-semibold">
                  Admin
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="placar" className="space-y-8">
              {/* Import Source Toggle */}
              {canEditData && (
                <div className="flex justify-center gap-2 p-1 bg-muted/50 rounded-lg w-fit mx-auto">
                  <Button
                    variant={importSource === 'txt' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setImportSource('txt')}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Arquivo TXT
                  </Button>
                  <Button
                    variant={importSource === 'database' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setImportSource('database')}
                    className="gap-2"
                  >
                    <Database className="w-4 h-4" />
                    Banco de Dados
                  </Button>
                </div>
              )}

              {/* Show appropriate import component */}
              {canEditData && importSource === 'txt' && (
                <FileUpload onFileUpload={handleFileUpload} />
              )}
              {canEditData && importSource === 'database' && (
                <DatabaseImport onDataLoaded={handleDatabaseImport} />
              )}
              
              <Scoreboard players={players} bossLabel={bossLabel} killLogs={killLogs} />
            </TabsContent>
            
            <TabsContent value="ranking">
              <RankingGeral />
            </TabsContent>

            <TabsContent value="classe-guild">
              <ClassGuildRanking />
            </TabsContent>

            <TabsContent value="putinha">
              <PutinhaRanking />
            </TabsContent>

            <TabsContent value="vergonha">
              <MuralDaVergonha />
            </TabsContent>

            <TabsContent value="killstreak">
              <KillStreakRanking />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="admin">
                <DatabaseManager />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
