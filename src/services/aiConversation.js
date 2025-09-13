const OpenAI = require('openai');
const DatabaseService = require('./database');

class AIConversationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateLinkedInMessage(prospect, messageType = 'initial') {
    const prompts = {
      initial: `Generate a personalized LinkedIn connection request for:
        Name: ${prospect.firstName} ${prospect.lastName}
        Title: ${prospect.title}
        Company: ${prospect.company}
        
        Requirements:
        - Under 200 characters
        - Reference their role at the law firm
        - Mention AI automation for client acquisition
        - Professional but conversational
        - No direct pitch`,
        
      follow_up: `Generate a follow-up LinkedIn message for:
        Name: ${prospect.firstName}
        Company: ${prospect.company}
        
        Ask about their biggest client acquisition challenges.
        Keep under 300 characters.`,
        
      qualification: `Generate a qualifying question for:
        Name: ${prospect.firstName}
        Company: ${prospect.company}
        
        Focus on budget, decision process, current lead gen methods.`
    };

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional sales AI helping law firms with client acquisition. Be conversational and helpful."
          },
          {
            role: "user",
            content: prompts[messageType]
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      const message = response.choices[0].message.content.trim();
      
      // Save generated message using Prisma
      await DatabaseService.addConversationMessage(prospect.id, {
        platform: 'linkedin',
        message: message,
        sender: 'ai',
        messageType: messageType
      });

      return message;
    } catch (error) {
      console.error('OpenAI error:', error);
      return this.getFallbackMessage(messageType, prospect);
    }
  }

  async analyzeProspectResponse(prospectId, response) {
    const analysisPrompt = `Analyze this response from a law firm partner:
    
    "${response}"
    
    Determine:
    1. Sentiment (positive/neutral/negative)
    2. Interest level (high/medium/low)  
    3. Next action (book_meeting/ask_questions/send_value/end_conversation)
    
    Return JSON format.`;

    try {
      const analysis = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 200
      });

      const result = JSON.parse(analysis.choices[0].message.content);
      
      // Update prospect status using Prisma
      let newStatus = 'RESPONDED';
      if (result.interestLevel === 'high') {
        newStatus = 'QUALIFIED';
      }
      
      await DatabaseService.updateProspectStatus(prospectId, newStatus, {
        sentiment: result.sentiment,
        interestLevel: result.interestLevel,
        nextAction: result.nextAction
      });

      // Add response to conversation
      await DatabaseService.addConversationMessage(prospectId, {
        platform: 'linkedin',
        message: response,
        sender: 'prospect'
      });

      return result;
    } catch (error) {
      console.error('Response analysis error:', error);
      return {
        sentiment: 'neutral',
        interestLevel: 'medium',
        nextAction: 'ask_questions'
      };
    }
  }

  getFallbackMessage(type, prospect) {
    const messages = {
      initial: `Hi ${prospect.firstName}, I help law firms like ${prospect.company} streamline client acquisition through AI automation. Would love to connect!`,
      follow_up: `Thanks for connecting! What's been your biggest challenge with new client acquisition at ${prospect.company}?`,
      qualification: `What's your current monthly target for new client inquiries, and what methods work best for you?`
    };
    return messages[type];
  }
}

module.exports = AIConversationService;
