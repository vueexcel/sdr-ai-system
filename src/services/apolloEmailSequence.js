const axios = require('axios');
const DatabaseService = require('../database/database');

class ApolloEmailSequenceService {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.baseURL = 'https://api.apollo.io/api/v1';
  }

  /**
   * Get all available email sequences from Apollo
   * FIXED: Using POST method with search endpoint
   */
  async getSequences() {
    try {
      const response = await axios.post(`${this.baseURL}/emailer_campaigns/search`, 
        {
          per_page: "25" // Request body for search
        },
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'accept': 'application/json',
            'X-Api-Key': this.apiKey
          }
        }
      );
      
      return response.data.emailer_campaigns || [];
    } catch (error) {
      console.error('Apollo Get Sequences Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get a specific email sequence by ID
   */
  async getSequenceById(sequenceId) {
    try {
      const response = await axios.get(`${this.baseURL}/emailer_campaigns/${sequenceId}`, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        }
      });
      
      return response.data.emailer_campaign || null;
    } catch (error) {
      console.error('Apollo Get Sequence Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get all email accounts linked to Apollo
   */
  async getEmailAccounts() {
    try {
      const response = await axios.get(`${this.baseURL}/email_accounts`, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        }
      });
      
      return response.data.email_accounts || [];
    } catch (error) {
      console.error('Apollo Get Email Accounts Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * NEW: Create a contact in Apollo
   * This is required before adding contacts to sequences
   */
  async createContact(prospectData) {
    try {
      const contactPayload = {
        first_name: prospectData.firstName,
        last_name: prospectData.lastName,
        title: prospectData.title,
        email: prospectData.email,
        organization_name: prospectData.company,
        linkedin_url: prospectData.linkedinUrl,
        // Optional fields
        phone_number: prospectData.phone,
        city: prospectData.location?.split(',')[0]?.trim() || null,
        state: prospectData.location?.split(',')[1]?.trim() || null,
        country: prospectData.location?.split(',')[2]?.trim() || null
      };

      // Remove null/undefined values
      Object.keys(contactPayload).forEach(key => {
        if (contactPayload[key] === null || contactPayload[key] === undefined || contactPayload[key] === '') {
          delete contactPayload[key];
        }
      });

      const response = await axios.post(`${this.baseURL}/contacts`, contactPayload, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        apolloContactId: response.data.contact.id,
        contact: response.data.contact
      };
    } catch (error) {
      console.error('Apollo Contact Creation Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Add contacts to an Apollo email sequence
   */
  async addContactsToSequence(sequenceId, contactIds, emailAccountId) {
  try {
    const response = await axios.post(
      `${this.baseURL}/emailer_campaigns/${sequenceId}/add_contact_ids`, 
      {
        contact_ids: contactIds,
        send_email_from_email_account_id: emailAccountId,
        emailer_campaign_id: sequenceId  // ← ADDED: This was missing!
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Apollo Add Contacts to Sequence Error:', error.response?.data || error.message);
    throw error;
  }
}

  /**
   * UPDATED: Send emails to prospects using Apollo sequences
   * Now includes automatic contact creation for prospects without Apollo Contact IDs
   */
  async sendEmailsToProspects(prospectIds, sequenceId = process.env.APOLLO_SEQUENCE_ID, emailAccountId = process.env.APOLLO_MAILBOX_ID) {
    try {
      console.log('\n🔄 Processing prospects for email sequence...');
      
      // 1. Get prospects from our database
      const prospects = await Promise.all(
        prospectIds.map(id => DatabaseService.getProspectById(id))
      );
      
      const validProspects = prospects.filter(p => p && (p.firstName && p.lastName));
      
      if (validProspects.length === 0) {
        return {
          success: false,
          message: 'No valid prospects found'
        };
      }

      console.log(`📋 Found ${validProspects.length} valid prospects`);
      
      // 2. Create Apollo contacts for prospects without Apollo Contact IDs
      let contactsCreated = 0;
      let contactsSkipped = 0;

      for (const prospect of validProspects) {
        if (!prospect.apolloContactId) {
          console.log(`🔄 Creating Apollo contact for ${prospect.firstName} ${prospect.lastName}...`);
          
          const contactResult = await this.createContact(prospect);
          
          if (contactResult.success) {
            // Update prospect with Apollo Contact ID
            await DatabaseService.updateProspectStatus(
              prospect.id,
              prospect.status,
              { apolloContactId: contactResult.apolloContactId }
            );
            
            prospect.apolloContactId = contactResult.apolloContactId;
            contactsCreated++;
            console.log(`   ✅ Created Apollo contact: ${contactResult.apolloContactId}`);
          } else {
            console.log(`   ❌ Failed to create contact: ${contactResult.error}`);
          }
          
          // Rate limiting - wait between requests
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          contactsSkipped++;
          console.log(`✅ ${prospect.firstName} ${prospect.lastName} - Already has Apollo Contact ID`);
        }
      }

      console.log(`📊 Contact Creation Results: ${contactsCreated} created, ${contactsSkipped} skipped`);
      
      // 3. Filter prospects that now have Apollo Contact IDs
      const prospectsWithIds = validProspects.filter(p => p.apolloContactId);
      
      if (prospectsWithIds.length === 0) {
        return {
          success: false,
          message: 'No prospects have Apollo contact IDs after creation attempts'
        };
      }
      
      // 4. Extract Apollo contact IDs
      const contactIds = prospectsWithIds.map(p => p.apolloContactId);
      console.log(`📧 Adding ${contactIds.length} contacts to sequence ${sequenceId}`);
      
      // 5. Add contacts to the sequence
      const result = await this.addContactsToSequence(sequenceId, contactIds, emailAccountId);
      
      // 6. Update prospect status in our database
      await Promise.all(
        prospectsWithIds.map(prospect => 
          DatabaseService.updateProspectStatus(prospect.id, 'MESSAGED', {
            lastInteraction: new Date(),
            firstMessageSent: prospect.firstMessageSent || new Date()
          })
        )
      );
      
      console.log('✅ Updated prospect statuses to MESSAGED');
      
      return {
        success: true,
        message: `Added ${result.num_enqueued || prospectsWithIds.length} prospects to Apollo sequence`,
        details: {
          contactsCreated,
          contactsSkipped,
          addedToSequence: prospectsWithIds.length,
          apolloResult: result
        }
      };
    } catch (error) {
      console.error('Send Emails to Prospects Error:', error.message);
      return {
        success: false,
        message: error.message,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * NEW: Bulk create contacts for multiple prospects
   * Useful for batch processing
   */
  async createContactsForProspects(prospects) {
    const results = {
      created: 0,
      failed: 0,
      details: []
    };

    for (const prospect of prospects) {
      if (prospect.apolloContactId) {
        results.details.push({
          prospect: `${prospect.firstName} ${prospect.lastName}`,
          status: 'skipped',
          reason: 'Already has Apollo Contact ID'
        });
        continue;
      }

      const result = await this.createContact(prospect);
      
      if (result.success) {
        // Update prospect in database
        await DatabaseService.updateProspectStatus(
          prospect.id,
          prospect.status,
          { apolloContactId: result.apolloContactId }
        );
        
        results.created++;
        results.details.push({
          prospect: `${prospect.firstName} ${prospect.lastName}`,
          status: 'created',
          apolloContactId: result.apolloContactId
        });
      } else {
        results.failed++;
        results.details.push({
          prospect: `${prospect.firstName} ${prospect.lastName}`,
          status: 'failed',
          error: result.error
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * NEW: Get sequence performance metrics
   */
  async getSequenceMetrics(sequenceId) {
    try {
      const response = await axios.get(`${this.baseURL}/emailer_campaigns/${sequenceId}/stats`, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Apollo Get Sequence Metrics Error:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = ApolloEmailSequenceService;
