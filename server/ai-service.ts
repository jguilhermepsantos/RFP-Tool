import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { franc } from "franc";
import { supabase } from "./db";
import { storage } from "./storage";

// Initialize OpenAI client (with error handling)
let openai: OpenAI | null = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log("OpenAI client initialized successfully");
  } else {
    console.log("OpenAI API key not provided - AI features will be disabled");
  }
} catch (error) {
  console.error("Error initializing OpenAI client:", error);
}

// Initialize Pinecone client (with error handling)
let pc: Pinecone | null = null;
try {
  if (process.env.PINECONE_API_KEY) {
    pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string
    });
    console.log("Pinecone client initialized successfully");
  } else {
    console.log("Pinecone API key not provided - vector search will be disabled");
  }
} catch (error) {
  console.error("Error initializing Pinecone client:", error);
}

// Configuration for Pinecone
const DEFAULT_INDEX_NAME = "rfp-assistant";
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || DEFAULT_INDEX_NAME;
const EMBEDDING_DIMENSION = 1536; // Dimension for text-embedding-3-small
const EMBEDDING_MODEL = "text-embedding-3-small";

console.log(`Using Pinecone index: ${PINECONE_INDEX_NAME}`);

// Language detection function
function detectLanguage(text: string): { language: string; confidence: number; languageName: string } {
  const detected = franc(text);
  
  // Map ISO 639-3 codes to language names and confidence
  const languageMap: Record<string, string> = {
    'eng': 'English',
    'spa': 'Spanish', 
    'por': 'Portuguese',
    'fra': 'French',
    'deu': 'German',
    'ita': 'Italian',
    'und': 'Undefined' // When franc can't detect
  };
  
  // Get confidence - franc returns 'und' for uncertain detection
  const confidence = detected === 'und' ? 0 : 0.85; // Assume good confidence for detected languages
  const languageName = languageMap[detected] || 'Unknown';
  
  console.log(`🌐 Detected language: ${languageName} (${detected}) - confidence: ${confidence}`);
  
  return {
    language: detected,
    confidence,
    languageName
  };
}

// Initialize Pinecone index
let index: any = null;

if (pc) {
  try {
    // Try to get the index
    index = pc.index(PINECONE_INDEX_NAME);
    console.log(`Connected to Pinecone index: ${PINECONE_INDEX_NAME}`);
  } catch (error) {
    console.error(`Error connecting to Pinecone index: ${error}`);
    // Don't throw here - allow server to start without Pinecone
  }
}

/**
 * Initialize Pinecone index if it doesn't exist
 */
export async function initializePineconeIndex(): Promise<boolean> {
  try {
    // Check if Pinecone client is available
    if (!pc) {
      console.log("Pinecone client not available - skipping index initialization");
      return false;
    }

    // List all indexes
    const indexes = await pc.listIndexes();
    
    // Check if our index exists
    const indexExists = indexes.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating Pinecone index: ${PINECONE_INDEX_NAME}`);
      
      // Create the index using Pinecone API spec format
      await pc!.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: EMBEDDING_DIMENSION,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1" // Changed to us-east-1 which is supported by free tier
          }
        }
      });
      
      // Wait for index to be ready (can take a minute)
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Get the newly created index
      index = pc!.index(PINECONE_INDEX_NAME);
      
      console.log(`Successfully created Pinecone index: ${PINECONE_INDEX_NAME}`);
    } else {
      console.log(`Pinecone index ${PINECONE_INDEX_NAME} already exists`);
    }
    
    return true;
  } catch (error) {
    console.error("Error initializing Pinecone:", error);
    return false;
  }
}

/**
 * Search for relevant chunks in Pinecone based on a question
 */
async function searchChunks(query: string, nResults: number = 3): Promise<{
  content: string[];
  metadata: { chunkId: string; similarity: number; source: 'document' | 'rfp' }[];
}> {
  try {
    console.log(`🔎 Searching chunks for: ${query}`);
    
    // Check if required services are available
    if (!openai) {
      console.log("OpenAI client not available - cannot perform search");
      return { content: [], metadata: [] };
    }
    
    if (!index) {
      console.log("Pinecone index not available - cannot perform search");
      return { content: [], metadata: [] };
    }
    
    // Step 1: Embed the query using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: [query]
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    
    // Step 2: Query Pinecone
    const searchResponse = await index.query({
      vector: queryEmbedding,
      topK: nResults,
      includeMetadata: true
    });
    
    // Step 3: Fetch chunk contents from Supabase using the chunk IDs from Pinecone
    if (!searchResponse.matches || searchResponse.matches.length === 0) {
      console.log("No matches found in Pinecone");
      return { content: [], metadata: [] };
    }
    
    const chunkIds = searchResponse.matches.map((match: any) => match.id);
    
    const { data: chunkData, error } = await supabase
      .from("chunks")
      .select("*")
      .in("id", chunkIds);
      
    if (error) {
      console.error("Error fetching chunks from Supabase:", error);
      return { content: [], metadata: [] };
    }
    
    // Create metadata array with similarity scores and source info
    const metadata = searchResponse.matches.map((match: any) => {
      const chunkInfo = chunkData?.find(chunk => chunk.id === match.id);
      return {
        chunkId: match.id,
        similarity: match.score || 0,
        source: chunkInfo?.source || 'document' as 'document' | 'rfp'
      };
    });
    
    // Return both content and metadata
    const content = (chunkData || []).map(row => row.content);
    
    return { content, metadata };
  } catch (error) {
    console.error("Error searching chunks:", error);
    return { content: [], metadata: [] };
  }
}

/**
 * Generate an AI answer from retrieved context chunks and the question
 */
// async function generateAnswer(contextChunks: string[], question: string): Promise<string> {
//   try {
//     const context = contextChunks.length > 0 
//       ? contextChunks.join("\n\n") 
//       : "No specific context available for this question.";
      
//     const prompt = `You are a Solution Engineer answering a customer RFP.
// ${contextChunks.length > 0 
//   ? 'Use only the context below to answer clearly and accurately.' 
//   : 'No specific context is available. Answer based on your general knowledge, but mention that this is a general response.'}

// Context:
// ${context}

// Question:
// ${question}

// Answer:`;

//     console.log(`🧠 Generating answer for: ${question}`);
    
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
//       messages: [{ role: "user", content: prompt }],
//       temperature: 0.2
//     });
    
//     return response.choices[0].message.content || "Unable to generate answer.";
//   } catch (error) {
//     console.error("Error generating answer:", error);
//     return "Error generating answer. Please try again later.";
//   }
// }

// /**
//  * Main function to process a question and return an answer
//  */
// export async function answerQuestion(question: string, nResults: number = 3): Promise<{
//   compliance: string;
//   answer: string;
// }> {
//   try {
//     console.log(`💬 Processing question: ${question}`);
    
//     // Step 1: Retrieve relevant chunks
//     const documents = await searchChunks(question, nResults);
    
//     // Even if no documents are found, we can still generate an answer 
//     // with the updated generateAnswer function that handles empty context
//     if (documents.length === 0) {
//       console.log("No relevant documents found in knowledge base. Generating answer without specific context.");
//     }
    
//     // Step 2: Generate the answer
//     const answer = await generateAnswer(documents, question);
    
//     // Log retrieval results
//     console.log("\n🧠 Top Matches:");
//     documents.forEach((doc, i) => {
//       console.log(`🔹 ${doc.substring(0, 100)}...`);
//     });
    
//     console.log("\n✅ Final Answer:");
//     console.log(answer);
    
//     // Simple compliance detection based on the answer content
//     let compliance = "Unknown";
    
//     // Check if the answer contains indicators of compliance levels
//     const answerLower = answer.toLowerCase();
//     if (answerLower.includes("full compliance") || 
//         answerLower.includes("fully compliant") || 
//         answerLower.includes("fully supports") ||
//         answerLower.includes("yes, natively")) {
//       compliance = "Yes, natively";
//     } else if (answerLower.includes("partial compliance") || 
//                answerLower.includes("partially compliant") ||
//                answerLower.includes("requires configuration") ||
//                answerLower.includes("with customization")) {
//       compliance = "Yes, with customization";
//     } else if (answerLower.includes("roadmap") ||
//                answerLower.includes("future release") ||
//                answerLower.includes("planned feature")) {
//       compliance = "Future roadmap";
//     } else if (answerLower.includes("does not support") ||
//                answerLower.includes("not supported") ||
//                answerLower.includes("cannot provide") ||
//                answerLower.includes("no support for")) {
//       compliance = "No";
//     } else if (answerLower.includes("third-party") ||
//                answerLower.includes("3rd party") ||
//                answerLower.includes("partner solution")) {
//       compliance = "Yes, with 3rd party";
//     } else if (documents.length === 0 || 
//                answerLower.includes("no specific context") ||
//                answerLower.includes("general response")) {
//       compliance = "Unknown";
//     } else {
//       // Default to assuming support
//       compliance = "Yes, natively";
//     }
    
//     return {
//       compliance,
//       answer
//     };
//   } catch (error) {
//     console.error("Error answering question:", error);
//     return {
//       compliance: "Error",
//       answer: "An error occurred while processing your question."
//     };
//   }
// }

/**
 * Calculate similarity metrics from source chunks
 */
function calculateSimilarityMetrics(chunks: { chunkId: string; similarity: number; source: 'document' | 'rfp' }[]): {
  averageSimilarity: number;
  confidenceLevel: 'low' | 'medium' | 'high';
} {
  if (chunks.length === 0) {
    return { averageSimilarity: 0, confidenceLevel: 'low' };
  }

  const averageSimilarity = chunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / chunks.length;
  
  let confidenceLevel: 'low' | 'medium' | 'high';
  if (averageSimilarity >= 0.7) {
    confidenceLevel = 'high';
  } else if (averageSimilarity >= 0.5) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }

  return { averageSimilarity, confidenceLevel };
}

export async function answerQuestion(
  question: string, 
  nResults: number = 3, 
  projectLanguage?: string,
  hierarchicalContext?: {
    section?: string;
    subsection?: string;
    requirementId?: string;
  }
): Promise<{
  compliance: string;
  answer: string;
  sourceChunks: { chunkId: string; similarity: number; source: 'document' | 'rfp' }[];
  averageSimilarity: number;
  confidenceLevel: 'low' | 'medium' | 'high';
}> {
  try {
    console.log(`💬 Processing question: ${question}`);
    if (hierarchicalContext) {
      console.log(`📂 Context: ${hierarchicalContext.section || 'N/A'} > ${hierarchicalContext.subsection || 'N/A'} (${hierarchicalContext.requirementId || 'N/A'})`);
    }

    // Step 1: Create enhanced query for better semantic matching
    let enhancedQuery = question;
    if (hierarchicalContext) {
      const contextParts = [];
      if (hierarchicalContext.section) contextParts.push(`Section: ${hierarchicalContext.section}`);
      if (hierarchicalContext.subsection) contextParts.push(`Subsection: ${hierarchicalContext.subsection}`);
      if (hierarchicalContext.requirementId) contextParts.push(`Requirement: ${hierarchicalContext.requirementId}`);
      
      if (contextParts.length > 0) {
        enhancedQuery = `[${contextParts.join(' | ')}] ${question}`;
        console.log(`🔍 Enhanced query: ${enhancedQuery}`);
      }
    }

    // Step 2: Retrieve relevant chunks with enhanced query
    const { content: documents, metadata } = await searchChunks(enhancedQuery, nResults);

    if (documents.length === 0) {
      console.log("No relevant documents found. Generating fallback answer.");
    }

    // Step 3: Generate answer with both hierarchical context and retrieved documents
    const { compliance, answer } = await generateAnswer(documents, question, projectLanguage, hierarchicalContext);

    // Step 4: Calculate similarity metrics
    const { averageSimilarity, confidenceLevel } = calculateSimilarityMetrics(metadata);

    // Log result
    console.log("\n🧠 Top Matches:");
    documents.forEach((doc: string, i: number) => {
      console.log(`🔹 ${doc.substring(0, 100)}...`);
    });

    console.log("\n✅ Final Answer:");
    console.log(answer);
    console.log(`\n📊 Confidence: ${confidenceLevel} (avg similarity: ${averageSimilarity.toFixed(3)})`);

    return { 
      compliance, 
      answer, 
      sourceChunks: metadata,
      averageSimilarity,
      confidenceLevel
    };

  } catch (error) {
    console.error("Error answering question:", error);
    return {
      compliance: "Error",
      answer: "An error occurred while processing your question.",
      sourceChunks: [],
      averageSimilarity: 0,
      confidenceLevel: 'low'
    };
  }
}

async function generateAnswer(
  contextChunks: string[], 
  question: string, 
  projectLanguage?: string,
  hierarchicalContext?: {
    section?: string;
    subsection?: string;
    requirementId?: string;
  }
): Promise<{
  compliance: string;
  answer: string;
}> {
  try {
    // Use project language if provided, otherwise detect from question
    let language: string;
    let languageName: string;
    
    if (projectLanguage) {
      // Map project language to franc language codes
      const languageMap: Record<string, { code: string; name: string }> = {
        'English': { code: 'eng', name: 'English' },
        'Spanish': { code: 'spa', name: 'Spanish' },
        'Portuguese': { code: 'por', name: 'Portuguese' },
        'French': { code: 'fra', name: 'French' },
        'German': { code: 'deu', name: 'German' },
        'Polish': { code: 'pol', name: 'Polish' }
      };
      
      const mappedLanguage = languageMap[projectLanguage] || languageMap['English'];
      language = mappedLanguage.code;
      languageName = mappedLanguage.name;
      
      console.log(`🎯 Using project language: ${languageName} (${language})`);
    } else {
      // Fallback to detection if no project language is set
      const detected = detectLanguage(question);
      language = detected.language;
      languageName = detected.languageName;
      
      console.log(`🔍 Detected language: ${languageName} (${language})`);
    }
    
    const context = contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "No specific context available for this question.";

    // Create language-specific compliance options
    const getComplianceOptions = (lang: string) => {
      switch (lang) {
        case 'spa': // Spanish
          return {
            native: "Sí, nativamente",
            customization: "Sí, con personalización", 
            thirdParty: "Sí, con integración de terceros",
            notProvided: "No, no proporcionado"
          };
        case 'por': // Portuguese
          return {
            native: "Sim, nativamente",
            customization: "Sim, com customização",
            thirdParty: "Sim, com integração de terceiros", 
            notProvided: "Não, não fornecido"
          };
        case 'fra': // French
          return {
            native: "Oui, nativement",
            customization: "Oui, avec personnalisation",
            thirdParty: "Oui, avec intégration tierce",
            notProvided: "Non, non fourni"
          };
        default: // English (default)
          return {
            native: "Yes, natively",
            customization: "Yes, with customization",
            thirdParty: "Yes, with 3rd party integration",
            notProvided: "No, not provided"
          };
      }
    };

    const complianceOptions = getComplianceOptions(language);

    // Build hierarchical context section for prompt
    let hierarchicalSection = '';
    if (hierarchicalContext) {
      const contextDetails = [];
      if (hierarchicalContext.section) contextDetails.push(`Section: ${hierarchicalContext.section}`);
      if (hierarchicalContext.subsection) contextDetails.push(`Subsection: ${hierarchicalContext.subsection}`);
      if (hierarchicalContext.requirementId) contextDetails.push(`Requirement ID: ${hierarchicalContext.requirementId}`);
      
      if (contextDetails.length > 0) {
        hierarchicalSection = `
RFP CONTEXT:
${contextDetails.join('\n')}

IMPORTANT: Consider this hierarchical context when crafting your answer. The section and subsection indicate the specific area of focus (e.g., B2B vs B2C, Enterprise vs Standard features, etc.). Tailor your response accordingly.
`;
      }
    }

    const prompt = `You are an experienced VTEX Solution Engineer answering a customer RFP.

CRITICAL LANGUAGE INSTRUCTION:
Question Language: ${languageName} (${language})
MANDATORY: Your response MUST be written entirely in ${languageName}. 
Do not mix languages or translate. Maintain the exact same language as the question throughout your entire response.
${hierarchicalSection}
${contextChunks.length > 0
  ? "Leverage the context below to answer clearly and accurately."
  : "No specific context is available. Answer based on your general knowledge, but make it clear that this is a general response."}

Context:
${context}

Question:
${question}

Respond strictly in the following JSON format (and nothing else): 

{
  "compliance": "<one of: ${complianceOptions.native} (when the feature is provided out-of-the-box by VTEX) | ${complianceOptions.customization} (when the feature requires code development) | ${complianceOptions.thirdParty} (when another software is required) | ${complianceOptions.notProvided} (when VTEX does not fulfill the requirement)>",
  "answer": "<elaborate answer string in ${languageName}, preferably with a link that supports the answer if a URL is available in the context chunks>"
}

LANGUAGE CONSISTENCY CHECK:
- Question is in: ${languageName}
- Your response must be in: ${languageName}  
- Do NOT translate or use any other language
- Ignore the language of context chunks - respond only in ${languageName}
`;

    console.log(`🧠 Sending prompt to LLM for ${languageName} question...`);

    if (!openai) {
      console.log("OpenAI client not available - cannot generate answer");
      return {
        compliance: "Unknown",
        answer: "AI service is not available. Please configure OpenAI API key."
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    const raw = response.choices[0].message.content || "";

    // Try parsing response
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const jsonString = raw.slice(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonString);

    console.log(`✅ Generated answer in ${languageName}: ${parsed.answer?.substring(0, 100)}...`);

    return {
      compliance: parsed.compliance || "Unknown",
      answer: parsed.answer || "No answer returned."
    };

  } catch (error) {
    console.error("Error generating or parsing answer:", error);
    return {
      compliance: "Error",
      answer: "An error occurred while generating the answer."
    };
  }
}


/**
 * Embeds all chunks for a specific document and updates the document status to 'embedded'
 */
export async function embedDocumentChunks(documentId: string): Promise<{
  success: boolean;
  chunksEmbedded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let chunksEmbedded = 0;

  try {
    console.log(`Starting embedding process for document: ${documentId}`);

    // Get all chunks for this specific document that haven't been embedded yet
    const chunks = await storage.getChunks(documentId);
    const unembeddedChunks = chunks.filter(chunk => !chunk.embedded);

    console.log(`Found ${unembeddedChunks.length} unembedded chunks for document ${documentId}`);

    if (unembeddedChunks.length === 0) {
      // Document already fully embedded, update status
      await storage.updateDocumentApprovalStatus(documentId, 'embedded');
      return {
        success: true,
        chunksEmbedded: 0,
        errors: []
      };
    }

    // Process each chunk
    for (const chunk of unembeddedChunks) {
      try {
        console.log(`Embedding chunk ${chunk.id} from document ${documentId}`);
        
        // Create embedding for the chunk content
        const embedding = await createEmbedding(chunk.content);
        
        // Index the chunk in Pinecone with document metadata
        const success = await indexChunk(chunk.id, chunk.content, {
          documentId: documentId,
          documentType: 'knowledge'
        });

        if (success) {
          // Mark chunk as embedded directly in Supabase
          const { error: updateError } = await supabase
            .from('chunks')
            .update({ 
              embedded: true, 
              embedded_at: new Date().toISOString() 
            })
            .eq('id', chunk.id);
            
          if (updateError) {
            console.error(`Error updating chunk ${chunk.id} embedding status:`, updateError);
            errors.push(`Failed to update embedding status for chunk ${chunk.id}: ${updateError.message}`);
          } else {
            chunksEmbedded++;
            console.log(`Successfully embedded chunk ${chunk.id} and updated status in Supabase`);
          }
        } else {
          errors.push(`Failed to index chunk ${chunk.id} in vector database`);
        }
      } catch (error) {
        const errorMessage = `Error embedding chunk ${chunk.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    // If all chunks were successfully embedded, update document status to 'embedded'
    if (errors.length === 0) {
      await storage.updateDocumentApprovalStatus(documentId, 'embedded');
      console.log(`Document ${documentId} fully embedded and status updated`);
    }

    return {
      success: errors.length === 0,
      chunksEmbedded,
      errors
    };
  } catch (error) {
    const errorMessage = `Error in embedDocumentChunks for ${documentId}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMessage);
    return {
      success: false,
      chunksEmbedded,
      errors: [errorMessage, ...errors]
    };
  }
}

/**
 * Create an embedding for a text using OpenAI
 */
async function createEmbedding(text: string): Promise<number[]> {
  try {
    if (!openai) {
      throw new Error("OpenAI client not available - cannot create embedding");
    }

    const embeddingResponse = await openai!.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [text]
    });
    
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error("Error creating embedding:", error);
    throw error;
  }
}

/**
 * Index a document chunk in Pinecone
 */
async function indexChunk(chunkId: string, content: string, metadata: any): Promise<boolean> {
  try {
    console.log(`Indexing chunk: ${chunkId.substring(0, 8)}...`);
    
    // Create embedding for the chunk content
    const embedding = await createEmbedding(content);
    
    // Upsert to Pinecone
    await index.upsert([{
      id: chunkId,
      values: embedding,
      metadata: { ...metadata, content: content.substring(0, 100) + '...' } // Add a preview of content to metadata
    }]);
    
    return true;
  } catch (error) {
    console.error(`Error indexing chunk ${chunkId}:`, error);
    return false;
  }
}

/**
 * Index all document chunks from a specific document
 */
export async function indexDocumentChunks(documentId: string): Promise<{
  success: boolean;
  indexedCount: number;
  errors: any[];
}> {
  try {
    console.log(`Indexing chunks for document: ${documentId}`);
    
    // Ensure Pinecone index exists
    await initializePineconeIndex();
    
    // Get chunks for this document directly - no document validation needed
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId);
      
    if (chunksError) {
      console.error(`Error fetching chunks:`, chunksError);
      throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
    }
    
    console.log(`Found ${chunks?.length || 0} chunks to index for document ${documentId}`);
    
    const errors: any[] = [];
    let indexedCount = 0;
    
    // Index each chunk
    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        try {
          const metadata = {
            documentId: documentId,
            scope: chunk.scope || 'global'
          };
          
          const success = await indexChunk(chunk.id, chunk.content, metadata);
          if (success) {
            indexedCount++;
          } else {
            errors.push({
              chunkId: chunk.id,
              error: "Failed to index chunk"
            });
          }
        } catch (chunkError) {
          console.error(`Error processing chunk ${chunk.id}:`, chunkError);
          errors.push({
            chunkId: chunk.id,
            error: chunkError instanceof Error ? chunkError.message : String(chunkError)
          });
        }
      }
    }
    
    console.log(`Successfully indexed ${indexedCount} chunks with ${errors.length} errors`);
    
    return {
      success: errors.length === 0,
      indexedCount,
      errors
    };
  } catch (error) {
    console.error("Error indexing document chunks:", error);
    return {
      success: false,
      indexedCount: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Index all knowledge base documents
 */
export async function indexKnowledgeBase(): Promise<{
  success: boolean;
  indexedDocuments: number;
  errors: any[];
}> {
  try {
    console.log("Indexing all knowledge base documents");
    
    // Ensure Pinecone index exists
    await initializePineconeIndex();
    
    // Get all knowledge documents
    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('*')
      .eq('type', 'knowledge');
      
    if (documentsError) {
      console.error(`Error fetching knowledge documents:`, documentsError);
      throw new Error(`Failed to fetch documents: ${documentsError.message}`);
    }
    
    console.log(`Found ${documents?.length || 0} knowledge documents to index`);
    
    const errors: any[] = [];
    let indexedDocuments = 0;
    
    // Index chunks for each document
    if (documents && documents.length > 0) {
      for (const document of documents) {
        try {
          const result = await indexDocumentChunks(document.id);
          if (result.success) {
            indexedDocuments++;
          } else {
            errors.push({
              documentId: document.id,
              documentName: document.name,
              error: `Indexed ${result.indexedCount} chunks with ${result.errors.length} errors`
            });
          }
        } catch (documentError) {
          console.error(`Error indexing document ${document.id}:`, documentError);
          errors.push({
            documentId: document.id,
            documentName: document.name,
            error: documentError instanceof Error ? documentError.message : String(documentError)
          });
        }
      }
    }
    
    return {
      success: errors.length === 0,
      indexedDocuments,
      errors
    };
  } catch (error) {
    console.error("Error indexing knowledge base:", error);
    return {
      success: false,
      indexedDocuments: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Embeds all unprocessed chunks and marks them as embedded in the database
 */
export async function embedUnprocessedChunks(limit: number = 100): Promise<{
  success: boolean;
  chunksEmbedded: number;
  errors: any[];
}> {
  try {
    console.log(`🔍 Fetching up to ${limit} unembedded chunks...`);
    
    // Get all unembedded chunks from database using our storage interface
    const { storage } = await import('./storage');
    const unembeddedChunks = await storage.getUnembeddedChunks(limit);
    
    console.log(`✅ Found ${unembeddedChunks.length} unembedded chunks.`);
    
    let embeddedCount = 0;
    const errors: any[] = [];
    
    // Ensure Pinecone index exists
    await initializePineconeIndex();
    
    // Process each chunk
    for (const chunk of unembeddedChunks) {
      try {
        // Create metadata for the chunk
        const metadata = {
          documentId: chunk.documentId,
          scope: chunk.scope || "global",
        };
        
        // Index the chunk in Pinecone
        const success = await indexChunk(chunk.id, chunk.content, metadata);
        
        if (success) {
          // Mark as embedded in database (keeping original implementation since this function isn't used)
          await storage.markChunkAsEmbedded(chunk.id);
          embeddedCount++;
          console.log(`✅ Embedded chunk ${chunk.id}`);
        } else {
          errors.push({
            chunkId: chunk.id,
            error: "Failed to index chunk in Pinecone"
          });
        }
      } catch (error) {
        console.error(`Error embedding chunk ${chunk.id}:`, error);
        errors.push({
          chunkId: chunk.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    console.log(`📊 Embedding process complete. Successfully embedded ${embeddedCount} chunks with ${errors.length} errors.`);
    
    return {
      success: errors.length === 0,
      chunksEmbedded: embeddedCount,
      errors
    };
  } catch (error) {
    console.error("Error in embedUnprocessedChunks:", error);
    return {
      success: false,
      chunksEmbedded: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export async function processDocumentQuestions(documentId: string): Promise<{
  success: boolean;
  processedCount: number;
  errors: any[];
}> {
  try {
    console.log(`📝 Processing questions for document: ${documentId}`);
    
    // Import progress tracker
    const { progressTracker } = await import('./progress-tracker');
    
    // First, get the RFP document to fetch project language
    const { data: rfpDocument, error: docError } = await supabase
      .from('rfp_documents')
      .select('project_id')
      .eq('id', documentId)
      .single();
      
    if (docError) {
      console.error(`Error fetching RFP document:`, docError);
      throw new Error(`Failed to fetch RFP document: ${docError.message}`);
    }
    
    // Get project language
    let projectLanguage: string | undefined;
    if (rfpDocument?.project_id) {
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('language')
        .eq('id', rfpDocument.project_id)
        .single();
        
      if (projectError) {
        console.warn(`Could not fetch project language: ${projectError.message}`);
      } else {
        projectLanguage = project?.language || undefined;
        console.log(`📋 Project language: ${projectLanguage || 'not set'}`);
      }
    }
    
    // Get questions for this document
    const { data: questions, error: questionsError } = await supabase
      .from('rfp_questions')
      .select('*')
      .eq('rfp_document_id', documentId);
      
    if (questionsError) {
      console.error(`Error fetching questions for processing:`, questionsError);
      progressTracker.sendError(documentId, `Failed to fetch questions: ${questionsError.message}`);
      throw new Error(`Failed to fetch questions: ${questionsError.message}`);
    }
    
    console.log(`Found ${questions?.length || 0} questions to process`);
    const totalQuestions = questions?.length || 0;
    
    if (totalQuestions === 0) {
      progressTracker.updateProgress({
        documentId,
        questionIndex: 0,
        totalQuestions: 0,
        progress: 100,
        status: "No questions to process",
        completed: true
      });
      return { success: true, processedCount: 0, errors: [] };
    }
    
    // Send initial progress
    progressTracker.updateProgress({
      documentId,
      questionIndex: 0,
      totalQuestions,
      progress: 0,
      status: "Starting question processing...",
      completed: false
    });
    
    const errors: any[] = [];
    let processedCount = 0;
    
    // Process each question and create answers
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      try {
        console.log(`Processing question ${i + 1}/${totalQuestions}: ${question.id} - ${question.question_text}`);
        
        // Update progress for current question
        progressTracker.updateProgress({
          documentId,
          questionIndex: i + 1,
          totalQuestions,
          progress: Math.round(((i) / totalQuestions) * 100),
          currentQuestion: question.question_text,
          status: `Processing question ${i + 1} of ${totalQuestions}...`,
          completed: false
        });
        
        // Check if answer already exists
        const { data: existingAnswer } = await supabase
          .from('rfp_answers')
          .select('*')
          .eq('rfp_question_id', question.id)
          .single();
          
        if (existingAnswer) {
          console.log(`Answer already exists for question ${question.id}, skipping`);
          processedCount++;
          continue;
        }
        
        // Generate answer using RAG with project language and hierarchical context
        const hierarchicalContext = {
          section: question.section || undefined,
          subsection: question.subsection || undefined,
          requirementId: question.requirement_id || undefined
        };
        
        const { compliance, answer, sourceChunks, averageSimilarity, confidenceLevel } = await answerQuestion(
          question.question_text, 
          3, 
          projectLanguage, 
          hierarchicalContext
        );
        
        // Create answer in database
        const { data: newAnswer, error: answerError } = await supabase
          .from('rfp_answers')
          .insert({
            rfp_document_id: documentId,
            rfp_question_id: question.id,
            question_text: question.question_text,
            compliance_answer: compliance,
            generated_answer: answer,
            source_chunks: JSON.stringify(sourceChunks),
            average_similarity: averageSimilarity,
            confidence_level: confidenceLevel,
            created_by: 'AI-generated'
          })
          .select()
          .single();
          
        if (answerError) {
          console.error(`Error creating answer for question ${question.id}:`, answerError);
          errors.push({
            questionId: question.id,
            error: answerError.message
          });
        } else {
          console.log(`Created answer ${newAnswer.id} for question ${question.id}`);
          processedCount++;
        }
      } catch (questionError) {
        console.error(`Error processing question ${question.id}:`, questionError);
        errors.push({
          questionId: question.id,
          error: questionError instanceof Error ? questionError.message : String(questionError)
        });
      }
    }
    
    // Send completion progress
    progressTracker.updateProgress({
      documentId,
      questionIndex: totalQuestions,
      totalQuestions,
      progress: 100,
      status: `Completed! Processed ${processedCount} of ${totalQuestions} questions`,
      completed: true
    });
    
    return {
      success: errors.length === 0,
      processedCount,
      errors
    };
  } catch (error) {
    console.error("Error processing document questions:", error);
    const { progressTracker } = await import('./progress-tracker');
    progressTracker.sendError(documentId, error instanceof Error ? error.message : String(error));
    return {
      success: false,
      processedCount: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}