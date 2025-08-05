import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { HierarchicalSection } from "@/utils/hierarchical-data";

interface RfpNavigationMenuProps {
  sections: HierarchicalSection[];
  className?: string;
}

interface NavigationItem {
  type: 'section' | 'subsection';
  id: string;
  name: string;
  sectionName?: string;
  subsectionName?: string;
  questionsCount: number;
  completedCount: number;
}

export default function RfpNavigationMenu({ sections, className = "" }: RfpNavigationMenuProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Initialize all sections as expanded
  useEffect(() => {
    const allSections = sections.map(s => s.section);
    setExpandedSections(new Set(allSections));
  }, [sections]);

  const toggleSection = (sectionName: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionName)) {
      newExpanded.delete(sectionName);
    } else {
      newExpanded.add(sectionName);
    }
    setExpandedSections(newExpanded);
  };

  const scrollToSection = (sectionName: string, subsectionName?: string) => {
    // Create a scroll target ID based on section and subsection
    let targetId: string;
    if (subsectionName) {
      // For subsections, create ID from both section and subsection
      targetId = `section-${sectionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-subsection-${subsectionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    } else {
      // For sections, create ID from section name
      targetId = `section-${sectionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    }

    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
      
      // Close mobile menu after navigation
      setIsMobileMenuOpen(false);
    }
  };

  const NavigationContent = () => (
    <div className="space-y-2">
      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.section);
        const sectionProgress = section.questionsCount > 0 
          ? Math.round((section.completedCount / section.questionsCount) * 100) 
          : 0;

        return (
          <div key={section.section} className="border rounded-lg bg-white">
            <Collapsible open={isExpanded} onOpenChange={() => toggleSection(section.section)}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                  <div className="flex items-center gap-2 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {section.section}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {section.completedCount}/{section.questionsCount}
                        </Badge>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 max-w-[60px]">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                            style={{ width: `${sectionProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="border-t border-gray-100">
                  {/* Section-level navigation button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start pl-8 py-1.5 h-auto text-xs font-normal hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => scrollToSection(section.section)}
                  >
                    View Section: {section.section}
                  </Button>
                  
                  {/* Subsections */}
                  {section.subsections.map((subsection) => {
                    const subsectionProgress = subsection.questionsCount > 0 
                      ? Math.round((subsection.completedCount / subsection.questionsCount) * 100) 
                      : 0;

                    return (
                      <Button
                        key={subsection.subsection || 'general'}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start pl-12 py-2 h-auto hover:bg-gray-50 border-l-2 border-transparent hover:border-blue-500"
                        onClick={() => scrollToSection(section.section, subsection.subsection || undefined)}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 truncate">
                              {subsection.subsection || "General Questions"}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-xs scale-90">
                                {subsection.completedCount}/{subsection.questionsCount}
                              </Badge>
                              <div className="w-full bg-gray-200 rounded-full h-1 max-w-[40px]">
                                <div 
                                  className="bg-green-500 h-1 rounded-full transition-all duration-300" 
                                  style={{ width: `${subsectionProgress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="mb-4"
        >
          {isMobileMenuOpen ? (
            <X className="h-4 w-4 mr-2" />
          ) : (
            <Menu className="h-4 w-4 mr-2" />
          )}
          {isMobileMenuOpen ? 'Close' : 'Navigation'}
        </Button>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 lg:hidden">
            <div className="absolute top-0 left-0 h-full w-80 bg-white shadow-lg overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">Navigation</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <NavigationContent />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Sidebar - Fixed/Floating */}
      <div className={`hidden lg:block ${className}`}>
        <div className="fixed top-20 left-6 w-80 max-h-[calc(100vh-6rem)] z-40">
          <Card className="shadow-lg border-2 bg-white/95 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Navigation</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <NavigationContent />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}