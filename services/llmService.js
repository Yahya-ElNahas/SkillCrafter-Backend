const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Global counter for LLM calls
let llmCallCount = 0;
let totalTokensUsed = 0;

async function getLLMResponse(prompt) {
  try {
    llmCallCount++;
    console.log(`LLM Call #${llmCallCount} - Prompt length: ${prompt.length} chars`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You recommend programming problems based on user performance." },
        { role: "user", content: prompt }
      ]
    });

    const tokensUsed = completion.usage.total_tokens;
    totalTokensUsed += tokensUsed;
    console.log(`LLM Call #${llmCallCount} completed - Tokens used: ${tokensUsed}, Total tokens: ${totalTokensUsed}`);

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("LLM error:", err);
    return null;
  }
}

module.exports = {
  getLLMResponse,
  getLLMStats: () => ({ calls: llmCallCount, totalTokens: totalTokensUsed })
};
