import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Swords, LogIn, LogOut, User, Crown, Skull, Users,
  Trophy, Target, Flame, Award, Menu, X, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  requiresAuth?: boolean;
  requiresEdit?: boolean;
  requiresAdmin?: boolean;
}

const navItems: NavItem[] = [
  { id: 'ranking', label: 'Ranking Geral', icon: Trophy },
  { id: 'throne', label: 'Throne', icon: Crown },
  { id: 'reis', label: 'Rei/Cone PVP', icon: Target },
  { id: 'classe-guild', label: 'Classe/Guild', icon: Users },
  { id: 'melhor-classe', label: 'Melhor por Classe', icon: Award },
  { id: 'putinha', label: 'Minha Putinha', icon: Flame },
  { id: 'vergonha', label: 'Mural da Vergonha', icon: Skull },
  { id: 'killstreak', label: 'Kill Streak', icon: Swords },
  { id: 'placar', label: 'Incluir Dados', icon: Swords, requiresEdit: true },
  { id: 'admin', label: 'Admin', icon: Shield, requiresAdmin: true },
];

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const AppSidebar = ({ activeTab, onTabChange }: AppSidebarProps) => {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { isAdmin, canEditData } = useUserRole();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const filteredItems = navItems.filter(item => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresEdit && !canEditData) return false;
    return true;
  });

  const handleSelect = (id: string) => {
    onTabChange(id);
    setOpen(false);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b border-border">
        <Swords className="w-6 h-6 text-primary" />
        <span className="font-bold text-lg text-foreground">PVP BOSS</span>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                "hover:bg-accent/10 hover:text-accent",
                isActive
                  ? "bg-primary/15 text-primary border-r-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        {user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="truncate">{user.email?.split('@')[0]}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2">
              <LogOut className="w-4 h-4" />
              Sair
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/auth')}
            className="w-full gap-2"
          >
            <LogIn className="w-4 h-4" />
            Login
          </Button>
        )}
      </div>
    </div>
  );

  // Mobile: Sheet overlay
  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          className="fixed top-4 left-4 z-50 bg-card/80 backdrop-blur-sm border border-border"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-64 p-0 bg-card">
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <NavContent />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <aside className="w-60 shrink-0 bg-card border-r border-border h-screen sticky top-0 overflow-hidden">
      <NavContent />
    </aside>
  );
};
