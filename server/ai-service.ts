import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { supabase } from "./db";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Pinecone client
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY as string
});

// Pinecone index for our knowledge base
const index = pc.index("rfp-assistant"); // Make sure this matches your Pinecone index name

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
    
    const chunkIds = searchResponse.matches.map(match => match.id);
    
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
async function generateAnswer(contextChunks: string[], question: string): Promise<string> {
  try {
    const context = contextChunks.join("\n\n");
    const prompt = `You are a VTEX Solution Engineer answering a customer RFP.
Use only the context below to answer clearly and accurately.

Context:
${context}

Question:
${question}

Answer:`;

    console.log(`🧠 Generating answer for: ${question}`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });
    
    return response.choices[0].message.content || "Unable to generate answer.";
  } catch (error) {
    console.error("Error generating answer:", error);
    return "Error generating answer. Please try again later.";
  }
}

/**
 * Main function to process a question and return an answer
 */
export async function answerQuestion(question: string, nResults: number = 3): Promise<{
  compliance: string;
  answer: string;
}> {
  try {
    console.log(`💬 Processing question: ${question}`);
    
    // Step 1: Retrieve relevant chunks
    const documents = await searchChunks(question, nResults);
    
    if (documents.length === 0) {
      return {
        compliance: "Unknown",
        answer: "Unable to find relevant information to answer this question accurately."
      };
    }
    
    // Step 2: Generate the answer
    const answer = await generateAnswer(documents, question);
    
    // Log retrieval results
    console.log("\n🧠 Top Matches:");
    documents.forEach((doc, i) => {
      console.log(`🔹 ${doc.substring(0, 100)}...`);
    });
    
    console.log("\n✅ Final Answer:");
    console.log(answer);
    
    // TODO: Implement more sophisticated compliance detection
    // For now, default to "Yes, natively" as in the Python code
    return {
      compliance: "Yes, natively",
      answer: answer
    };
  } catch (error) {
    console.error("Error answering question:", error);
    return {
      compliance: "Error",
      answer: "An error occurred while processing your question."
    };
  }
}

/**
 * Process all questions for a document
 */
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