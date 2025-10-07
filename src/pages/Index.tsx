import { useState } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { Scoreboard, PlayerStats } from '@/components/Scoreboard';
import { parseTxtFile } from '@/utils/txtParser';
import { Swords } from 'lucide-react';

const Index = () => {
  const [players, setPlayers] = useState<PlayerStats[]>([]);

  const handleFileUpload = (content: string) => {
    const parsedPlayers = parseTxtFile(content);
    setPlayers(parsedPlayers);
  };

  return (
    <div className="min-h-screen bg-background gradient-gaming">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Swords className="w-12 h-12 text-primary animate-pulse" />
            <h1 className="text-5xl font-bold text-foreground text-glow">
              Battle Scoreboard
            </h1>
            <Swords className="w-12 h-12 text-primary animate-pulse" />
          </div>
          <p className="text-lg text-muted-foreground">
            Extrator de placar de batalhas - Análise de kills, deaths e KDA
          </p>
        </header>

        <div className="space-y-8">
          <FileUpload onFileUpload={handleFileUpload} />
          <Scoreboard players={players} />
        </div>
      </div>
    </div>
  );
};

export default Index;
