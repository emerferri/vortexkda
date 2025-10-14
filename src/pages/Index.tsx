import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { Scoreboard, PlayerStats } from '@/components/Scoreboard';
import { RankingGeral } from '@/components/RankingGeral';
import { Characters } from '@/components/Characters';
import { ClassGuildRanking } from '@/components/ClassGuildRanking';
import { PutinhaRanking } from '@/components/PutinhaRanking';
import { parseTxtFile } from '@/utils/txtParser';
import { Swords, LogIn, LogOut, User } from 'lucide-react';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleFileUpload = (content: string) => {
    const result = parseTxtFile(content);
    setPlayers(result.players);
    setBossLabel(result.bossLabel);
  };

  return (
    <div className="min-h-screen bg-background gradient-gaming">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4 relative">
            <Swords className="w-12 h-12 text-primary animate-pulse" />
            <h1 className="text-5xl font-bold text-foreground text-glow">
              Placar da humiliação
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
            Extrator de nuub, idenfica o cara mais horrivel e a lenda do game!
          </p>
        </header>

        <div className="space-y-8">
          <Tabs defaultValue="placar" className="w-full">
            <TabsList className="grid w-full max-w-4xl mx-auto grid-cols-5 mb-8">
              <TabsTrigger value="placar" className="text-base font-semibold">
                Placar da Humilhação
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
              <TabsTrigger value="personagens" className="text-base font-semibold">
                Personagens
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="placar" className="space-y-8">
              <FileUpload onFileUpload={handleFileUpload} />
              <Scoreboard players={players} bossLabel={bossLabel} />
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

            <TabsContent value="personagens">
              <Characters />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Index;
