import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, LogOut, User, FileUp, Settings } from "lucide-react";

export default function NavHeader() {
  const { user, logout, isAdmin } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out",
    });
  };

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 flex justify-between items-center h-16">
        <div className="flex items-center">
          <Link href="/projects">
            <a className="flex items-center text-xl font-bold">
              <FileText className="mr-2 h-6 w-6 text-primary" />
              <span>RFP Assistant</span>
            </a>
          </Link>
          
          <nav className="hidden md:flex ml-8 space-x-4">
            <Link href="/projects">
              <a className={`px-3 py-2 rounded-md text-sm font-medium ${
                location === '/projects' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}>
                Projects
              </a>
            </Link>
            <Link href="/suggest-document">
              <a className={`px-3 py-2 rounded-md text-sm font-medium ${
                location === '/suggest-document' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}>
                Suggest Document
              </a>
            </Link>
          </nav>
        </div>
        
        <div className="flex items-center">
          {isAdmin && (
            <span className="mr-3 px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-800">
              Admin
            </span>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {user?.email || 'User'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <Link href="/projects">
                <DropdownMenuItem className="cursor-pointer">
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Projects</span>
                </DropdownMenuItem>
              </Link>
              <Link href="/suggest-document">
                <DropdownMenuItem className="cursor-pointer">
                  <FileUp className="mr-2 h-4 w-4" />
                  <span>Suggest Document</span>
                </DropdownMenuItem>
              </Link>
              {isAdmin && (
                <Link href="/admin-settings">
                  <DropdownMenuItem className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Admin Settings</span>
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
