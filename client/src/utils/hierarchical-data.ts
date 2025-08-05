/**
 * Utility functions for organizing RFP questions into hierarchical structures
 */

export interface HierarchicalQuestion {
  id: string;
  rfpDocumentId: string | null;
  questionNumber?: string;
  questionText: string;
  requirementId: string | null;
  section: string | null;
  subsection: string | null;
  assignedTo: string | null;
  assignedUser: {
    id: string;
    email: string;
    name?: string;
  } | null;
  reviewed: boolean;
  createdAt: string;
  answer: any; // Keep this flexible for now
}

export interface HierarchicalSection {
  section: string;
  subsections: HierarchicalSubsection[];
  assignedTo: string | null;
  assignedUser: {
    id: string;
    email: string;
    name?: string;
  } | null;
  questionsCount: number;
  completedCount: number;
}

export interface HierarchicalSubsection {
  subsection: string | null; // null for questions without subsections
  questions: HierarchicalQuestion[];
  assignedTo: string | null;
  assignedUser: {
    id: string;
    email: string;
    name?: string;
  } | null;
  questionsCount: number;
  completedCount: number;
}

export interface HierarchicalStructure {
  sections: HierarchicalSection[];
  unorganizedQuestions: HierarchicalQuestion[]; // Questions without section
}

/**
 * Organize flat question list into hierarchical structure
 */
export function organizeQuestionsHierarchically(
  questions: HierarchicalQuestion[],
  projectMembers: Array<{
    id: string;
    email: string;
    name?: string;
  }> = []
): HierarchicalStructure {
  const sections: Map<string, HierarchicalSection> = new Map();
  const unorganizedQuestions: HierarchicalQuestion[] = [];
  const sectionOrder: Map<string, number> = new Map();
  const subsectionOrder: Map<string, number> = new Map();

  // Helper function to get user info
  const getUserInfo = (userId: string | null) => {
    if (!userId) return null;
    return projectMembers.find(member => member.id === userId) || null;
  };

  // Process each question
  questions.forEach((question, index) => {
    if (!question.section) {
      // Question without section goes to unorganized
      unorganizedQuestions.push(question);
      return;
    }

    // Track the order of sections as they appear in the CSV
    if (!sectionOrder.has(question.section)) {
      sectionOrder.set(question.section, index);
    }

    // Track the order of subsections as they appear in the CSV
    const subsectionKey = question.subsection || null;
    const subsectionMapKey = `${question.section}:${subsectionKey}`;
    if (!subsectionOrder.has(subsectionMapKey)) {
      subsectionOrder.set(subsectionMapKey, index);
    }

    // Get or create section
    if (!sections.has(question.section)) {
      sections.set(question.section, {
        section: question.section,
        subsections: [],
        assignedTo: null,
        assignedUser: null,
        questionsCount: 0,
        completedCount: 0
      });
    }

    const section = sections.get(question.section)!;
    section.questionsCount++;
    if (question.reviewed) {
      section.completedCount++;
    }

    // Find or create subsection
    let subsection = section.subsections.find(s => s.subsection === subsectionKey);
    
    if (!subsection) {
      subsection = {
        subsection: subsectionKey,
        questions: [],
        assignedTo: null,
        assignedUser: null,
        questionsCount: 0,
        completedCount: 0
      };
      section.subsections.push(subsection);
    }

    subsection.questions.push(question);
    subsection.questionsCount++;
    if (question.reviewed) {
      subsection.completedCount++;
    }
  });

  // Convert map to array and sort by CSV order instead of alphabetically
  const sortedSections = Array.from(sections.values()).sort((a, b) => 
    (sectionOrder.get(a.section) || 0) - (sectionOrder.get(b.section) || 0)
  );

  // Sort subsections within each section and determine section-level assignments
  sortedSections.forEach(section => {
    section.subsections.sort((a, b) => {
      if (a.subsection === null) return 1; // null subsections go last
      if (b.subsection === null) return -1;
      
      // Sort by CSV order instead of alphabetically
      const aKey = `${section.section}:${a.subsection}`;
      const bKey = `${section.section}:${b.subsection}`;
      const aOrder = subsectionOrder.get(aKey) || 0;
      const bOrder = subsectionOrder.get(bKey) || 0;
      
      return aOrder - bOrder;
    });

    // Sort questions within each subsection and determine subsection-level assignments
    section.subsections.forEach(subsection => {
      subsection.questions.sort((a, b) => {
        // Sort by requirement ID if available, otherwise by question text
        if (a.requirementId && b.requirementId) {
          return a.requirementId.localeCompare(b.requirementId);
        }
        return a.questionText.localeCompare(b.questionText);
      });

      // Determine if all questions in this subsection are assigned to the same person
      const assignedUsers = [...new Set(subsection.questions.map(q => q.assignedTo).filter(Boolean))];
      if (assignedUsers.length === 1) {
        subsection.assignedTo = assignedUsers[0];
        subsection.assignedUser = getUserInfo(assignedUsers[0]);
      }
    });

    // Determine if all questions in this section are assigned to the same person
    const allQuestionsInSection = section.subsections.flatMap(sub => sub.questions);
    const assignedUsers = [...new Set(allQuestionsInSection.map(q => q.assignedTo).filter(Boolean))];
    if (assignedUsers.length === 1) {
      section.assignedTo = assignedUsers[0];
      section.assignedUser = getUserInfo(assignedUsers[0]);
    }
  });

  return {
    sections: sortedSections,
    unorganizedQuestions: unorganizedQuestions.sort((a, b) => {
      if (a.requirementId && b.requirementId) {
        return a.requirementId.localeCompare(b.requirementId);
      }
      return a.questionText.localeCompare(b.questionText);
    })
  };
}

/**
 * Get effective assignment for a question considering inheritance
 */
export function getEffectiveAssignment(
  question: HierarchicalQuestion,
  sectionAssignments: Array<{
    section: string;
    subsection: string | null;
    assignedTo: string;
    assignedUser?: {
      id: string;
      email: string;
      name?: string;
    };
  }> = []
): {
  assignedTo: string | null;
  assignedUser: any;
  source: 'question' | 'subsection' | 'section' | 'none';
} {
  // Individual question assignment takes precedence
  if (question.assignedTo) {
    return {
      assignedTo: question.assignedTo,
      assignedUser: question.assignedUser,
      source: 'question'
    };
  }

  // Check for subsection assignment
  if (question.section && question.subsection) {
    const subsectionAssignment = sectionAssignments.find(
      a => a.section === question.section && a.subsection === question.subsection
    );
    if (subsectionAssignment) {
      return {
        assignedTo: subsectionAssignment.assignedTo,
        assignedUser: subsectionAssignment.assignedUser,
        source: 'subsection'
      };
    }
  }

  // Check for section assignment
  if (question.section) {
    const sectionAssignment = sectionAssignments.find(
      a => a.section === question.section && a.subsection === null
    );
    if (sectionAssignment) {
      return {
        assignedTo: sectionAssignment.assignedTo,
        assignedUser: sectionAssignment.assignedUser,
        source: 'section'
      };
    }
  }

  return {
    assignedTo: null,
    assignedUser: null,
    source: 'none'
  };
}

/**
 * Calculate progress statistics for hierarchical structure
 */
export function calculateHierarchicalProgress(structure: HierarchicalStructure) {
  const totalQuestions = structure.sections.reduce((sum, section) => sum + section.questionsCount, 0) + 
                        structure.unorganizedQuestions.length;
  
  const completedQuestions = structure.sections.reduce((sum, section) => sum + section.completedCount, 0) + 
                            structure.unorganizedQuestions.filter(q => q.reviewed).length;

  return {
    totalQuestions,
    completedQuestions,
    progressPercentage: totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0
  };
}