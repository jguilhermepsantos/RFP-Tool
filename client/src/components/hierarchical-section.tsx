import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Users, UserPlus, UserX, CheckCircle } from "lucide-react";
import { HierarchicalSection, HierarchicalSubsection } from "@/utils/hierarchical-data";
import RfpAnswerEditor from "./rfp-answer-editor";

interface HierarchicalSectionProps {
  section: HierarchicalSection;
  documentStatus: string;
  projectId: string;
  documentId: string;
  members: Array<{ id: string; email: string; name?: string; role: string }>;
  onAssignQuestion: (questionId: string, assignedTo: string) => void;
  onUnassignQuestion: (questionId: string) => void;
  onAssignSection: (section: string, subsection: string | null, assignedTo: string) => void;
  onUnassignSection: (section: string, subsection: string | null) => void;
  onToggleReviewed?: (questionId: string, currentReviewedStatus: boolean) => void;
}

interface HierarchicalSubsectionProps {
  subsection: HierarchicalSubsection;
  sectionName: string;
  documentStatus: string;
  projectId: string;
  documentId: string;
  members: Array<{ id: string; email: string; name?: string; role: string }>;
  onAssignQuestion: (questionId: string, assignedTo: string) => void;
  onUnassignQuestion: (questionId: string) => void;
  onAssignSection: (section: string, subsection: string | null, assignedTo: string) => void;
  onUnassignSection: (section: string, subsection: string | null) => void;
  onToggleReviewed?: (questionId: string, currentReviewedStatus: boolean) => void;
}

function HierarchicalSubsectionComponent({
  subsection,
  sectionName,
  documentStatus,
  projectId,
  documentId,
  members,
  onAssignQuestion,
  onUnassignQuestion,
  onAssignSection,
  onUnassignSection,
  onToggleReviewed
}: HierarchicalSubsectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const canAssign = documentStatus === 'unprocessed' || documentStatus === 'under review' || documentStatus === 'processed';
  
  const progressPercentage = subsection.questionsCount > 0 
    ? Math.round((subsection.completedCount / subsection.questionsCount) * 100) 
    : 0;

  // Create scroll target ID for subsection
  const subsectionId = `section-${sectionName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-subsection-${(subsection.subsection || 'general').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  return (
    <div className="border-l-2 border-gray-200 pl-4 ml-4" id={subsectionId}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between py-2 hover:bg-gray-50 rounded-lg px-3 cursor-pointer">
            <div className="flex items-center gap-3">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm text-gray-800">
                  {subsection.subsection || "General Questions"}
                </h4>
                <Badge variant="outline" className="text-xs">
                  {subsection.completedCount}/{subsection.questionsCount}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {progressPercentage === 100 && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              
              {/* Subsection Assignment Controls */}
              {canAssign && (
                <div className="flex items-center gap-2">
                  {subsection.assignedTo ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnassignSection(sectionName, subsection.subsection);
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        Unassign
                      </Button>
                      <Select 
                        value={subsection.assignedTo} 
                        onValueChange={(value) => {
                          onAssignSection(sectionName, subsection.subsection, value);
                        }}
                      >
                        <SelectTrigger className="h-6 w-24 text-xs" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name || member.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <Select 
                      value="" 
                      onValueChange={(value) => {
                        onAssignSection(sectionName, subsection.subsection, value);
                      }}
                    >
                      <SelectTrigger className="h-6 w-24 text-xs" onClick={(e) => e.stopPropagation()}>
                        <SelectValue placeholder="Assign..." />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name || member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Assigned user display */}
              {subsection.assignedUser && (
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <Users className="h-3 w-3" />
                  <span>{subsection.assignedUser.name || subsection.assignedUser.email}</span>
                </div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="space-y-4 pt-2">
            {subsection.questions.map((question) => (
              <RfpAnswerEditor
                key={question.id}
                question={{
                  ...question,
                  questionNumber: question.questionNumber || ""
                }}
                documentStatus={documentStatus}
                projectId={projectId}
                documentId={documentId}
                members={members}
                onAssign={onAssignQuestion}
                onUnassign={onUnassignQuestion}
                onToggleReviewed={onToggleReviewed}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function HierarchicalSectionComponent({
  section,
  documentStatus,
  projectId,
  documentId,
  members,
  onAssignQuestion,
  onUnassignQuestion,
  onAssignSection,
  onUnassignSection,
  onToggleReviewed
}: HierarchicalSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const canAssign = documentStatus === 'unprocessed' || documentStatus === 'under review' || documentStatus === 'processed';
  
  const progressPercentage = section.questionsCount > 0 
    ? Math.round((section.completedCount / section.questionsCount) * 100) 
    : 0;

  // Create scroll target ID for section
  const sectionId = `section-${section.section.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  return (
    <Card className="mb-4" id={sectionId}>
      <CardHeader className="pb-3">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2">
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500" />
                )}
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{section.section}</CardTitle>
                  <Badge variant="outline">
                    {section.completedCount}/{section.questionsCount}
                  </Badge>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">{progressPercentage}%</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {progressPercentage === 100 && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
                
                {/* Section Assignment Controls */}
                {canAssign && (
                  <div className="flex items-center gap-2">
                    {section.assignedTo ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUnassignSection(section.section, null);
                          }}
                          className="h-7 px-2"
                        >
                          <UserX className="h-3 w-3 mr-1" />
                          Unassign
                        </Button>
                        <Select 
                          value={section.assignedTo} 
                          onValueChange={(value) => {
                            onAssignSection(section.section, null, value);
                          }}
                        >
                          <SelectTrigger className="h-7 w-32" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name || member.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Select 
                        value="" 
                        onValueChange={(value) => {
                          onAssignSection(section.section, null, value);
                        }}
                      >
                        <SelectTrigger className="h-7 w-32" onClick={(e) => e.stopPropagation()}>
                          <SelectValue placeholder="Assign section..." />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name || member.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Assigned user display */}
                {section.assignedUser && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>{section.assignedUser.name || section.assignedUser.email}</span>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {section.subsections.map((subsection) => (
                  <HierarchicalSubsectionComponent
                    key={`${section.section}-${subsection.subsection || 'null'}`}
                    subsection={subsection}
                    sectionName={section.section}
                    documentStatus={documentStatus}
                    projectId={projectId}
                    documentId={documentId}
                    members={members}
                    onAssignQuestion={onAssignQuestion}
                    onUnassignQuestion={onUnassignQuestion}
                    onAssignSection={onAssignSection}
                    onUnassignSection={onUnassignSection}
                    onToggleReviewed={onToggleReviewed}
                  />
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>
    </Card>
  );
}