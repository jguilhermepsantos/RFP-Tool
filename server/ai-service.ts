import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { supabase } from "./db";
import { storage } from "./storage";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Pinecone client
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string
});

// Configuration for Pinecone
const DEFAULT_INDEX_NAME = "rfp-assistant";
// Log to check what value is actually being read from environment
console.log(`Environment PINECONE_INDEX_NAME is: "${process.env.PINECONE_INDEX_NAME}"`);

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || DEFAULT_INDEX_NAME;
const EMBEDDING_DIMENSION = 1536; // Dimension for text-embedding-3-small
const EMBEDDING_MODEL = "text-embedding-3-small";

console.log(`Using Pinecone index: ${PINECONE_INDEX_NAME}`);

// Initialize Pinecone index
let index: any;

try {
  // Try to get the index
  index = pc.index(PINECONE_INDEX_NAME);
  console.log(`Connected to Pinecone index: ${PINECONE_INDEX_NAME}`);
} catch (error) {
  console.error(`Error connecting to Pinecone index: ${error}`);
  throw error;
}

/**
 * Initialize Pinecone index if it doesn't exist
 */
export async function initializePineconeIndex(): Promise<boolean> {
  try {
    // List all indexes
    const indexes = await pc.listIndexes();
    
    // Check if our index exists
    const indexExists = indexes.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating Pinecone index: ${PINECONE_INDEX_NAME}`);
      
      // Create the index using Pinecone API spec format
      await pc.createIndex({
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
      index = pc.index(PINECONE_INDEX_NAME);
      
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
async function searchChunks(query: string, nResults: number = 3): Promise<string[]> {
  try {
    console.log(`🔎 Searching chunks for: ${query}`);
    
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
      return [];
    }
    
    const chunkIds = searchResponse.matches.map((match: any) => match.id);
    
    const { data: chunkData, error } = await supabase
      .from("chunks")
      .select("*")
      .in("id", chunkIds);
      
    if (error) {
      console.error("Error fetching chunks from Supabase:", error);
      return [];
    }
    
    // Return the actual chunk contents
    return (chunkData || []).map(row => row.content);
  } catch (error) {
    console.error("Error searching chunks:", error);
    return [];
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

export async function answerQuestion(question: string, nResults: number = 3): Promise<{
  compliance: string;
  answer: string;
}> {
  try {
    console.log(`💬 Processing question: ${question}`);

    // Step 1: Retrieve relevant chunks
    const documents = await searchChunks(question, nResults);

    if (documents.length === 0) {
      console.log("No relevant documents found. Generating fallback answer.");
    }

    // Step 2: Generate both compliance + elaborate answer in a single LLM call
    const { compliance, answer } = await generateAnswer(documents, question);

    // Log result
    console.log("\n🧠 Top Matches:");
    documents.forEach((doc, i) => {
      console.log(`🔹 ${doc.substring(0, 100)}...`);
    });

    console.log("\n✅ Final Answer:");
    console.log(answer);

    return { compliance, answer };

  } catch (error) {
    console.error("Error answering question:", error);
    return {
      compliance: "Error",
      answer: "An error occurred while processing your question."
    };
  }
}

async function generateAnswer(contextChunks: string[], question: string): Promise<{
  compliance: string;
  answer: string;
}> {
  try {
    const context = contextChunks.length > 0
      ? contextChunks.join("\n\n")
      : "No specific context available for this question.";

    const prompt = `You are a VTEX Solution Engineer answering a customer RFP.

${contextChunks.length > 0
  ? "Use only the context below to answer clearly and accurately."
  : "No specific context is available. Answer based on your general knowledge, but make it clear that this is a general response."}

Context:
${context}

Question:
${question}

Respond strictly in the following JSON format (and nothing else): It is important that the entire answer is provided in the same language as the question.

{
  "compliance": "<one of: Yes, natively | Yes, with customization | Yes, with 3rd party integration | No, not provided | Unknown>",
  "answer": "<elaborate answer string>"
}
`;

    console.log(`🧠 Sending prompt to LLM...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    const raw = response.choices[0].message.content || "";

    // Try parsing response
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    const jsonString = raw.slice(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonString);

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
          // Mark chunk as embedded in the database
          await storage.markChunkAsEmbedded(chunk.id);
          chunksEmbedded++;
          console.log(`Successfully embedded chunk ${chunk.id}`);
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
    const embeddingResponse = await openai.embeddings.create({
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
    
    // Get document details
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
      
    if (documentError) {
      console.error(`Error fetching document:`, documentError);
      throw new Error(`Failed to fetch document: ${documentError.message}`);
    }
    
    // Get chunks for this document
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
            documentId: document.id,
            documentName: document.name,
            documentType: document.type,
            chunkIndex: chunk.chunk_index
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
          // Mark as embedded in database
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
    
    // Get questions for this document
    const { data: questions, error: questionsError } = await supabase
      .from('rfp_questions')
      .select('*')
      .eq('rfp_document_id', documentId);
      
    if (questionsError) {
      console.error(`Error fetching questions for processing:`, questionsError);
      throw new Error(`Failed to fetch questions: ${questionsError.message}`);
    }
    
    console.log(`Found ${questions?.length || 0} questions to process`);
    
    const errors: any[] = [];
    let processedCount = 0;
    
    // Process each question and create answers
    if (questions && questions.length > 0) {
      for (const question of questions) {
        try {
          console.log(`Processing question: ${question.id} - ${question.question_text}`);
          
          // Check if answer already exists
          const { data: existingAnswer } = await supabase
            .from('rfp_answers')
            .select('*')
            .eq('rfp_question_id', question.id)
            .single();
            
          if (existingAnswer) {
            console.log(`Answer already exists for question ${question.id}, skipping`);
            continue;
          }
          
          // Generate answer using RAG
          const { compliance, answer } = await answerQuestion(question.question_text);
          
          // Create answer in database
          const { data: newAnswer, error: answerError } = await supabase
            .from('rfp_answers')
            .insert({
              rfp_document_id: documentId,
              rfp_question_id: question.id,
              question_text: question.question_text,
              compliance_answer: compliance,
              generated_answer: answer
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
    }
    
    return {
      success: errors.length === 0,
      processedCount,
      errors
    };
  } catch (error) {
    console.error("Error processing document questions:", error);
    return {
      success: false,
      processedCount: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}