require('dotenv').config();
const axios = require('axios');
const DatabaseService = require('../database/database');

class ApolloLinkedInSequenceService {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.baseURL = process.env.APOLLO_API_BASE_URL || 'https://api.apollo.io/v1';
    this.linkedinSequenceId = process.env.APOLLO_LINKEDIN_SEQUENCE_ID;
    this.mailboxId = process.env.APOLLO_MAILBOX_ID;
    
    if (!this.apiKey) {
      throw new Error('APOLLO_API_KEY is required');
    }
    if (!this.linkedinSequenceId) {
      throw new Error('APOLLO_LINKEDIN_SEQUENCE_ID is required');
    }
    if (!this.mailboxId) {
      throw new Error('APOLLO_MAILBOX_ID is required');
    }
  }

  // Get all available sequences
  async getSequences() {
    try {
      const response = await axios.post(
        `${this.baseURL}/emailer_campaigns/search`,
        {},
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.emailer_campaigns || [];
    } catch (error) {
      console.error('❌ Failed to fetch sequences:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get available email accounts
  async getEmailAccounts() {
    try {
      const response = await axios.get(`${this.baseURL}/email_accounts`, {
        headers: {
          'x-api-key': this.apiKey
        }
      });
      return response.data.email_accounts || [];
    } catch (error) {
      console.error('❌ Failed to fetch email accounts:', error.response?.data || error.message);
      throw error;
    }
  }

  // Create Apollo contact with LinkedIn focus
  async createLinkedInContact(prospectData) {
    try {
      console.log(`🔄 Creating LinkedIn-focused Apollo contact for ${prospectData.firstName} ${prospectData.lastName}...`);

      // Ensure email exists (generate if needed)
      const email = prospectData.email || this.generateEmail(prospectData);
      
      if (!email) {
        throw new Error(`Cannot generate email for ${prospectData.firstName} - missing company data`);
      }

      // Validate LinkedIn URL exists
      if (!prospectData.linkedinUrl) {
        throw new Error(`LinkedIn URL required for ${prospectData.firstName} ${prospectData.lastName}`);
      }

      const contactPayload = {
        first_name: prospectData.firstName,
        last_name: prospectData.lastName,
        title: prospectData.title || '',
        organization_name: prospectData.company || '',
        email: email,
        linkedin_url: prospectData.linkedinUrl,
        phone_numbers: prospectData.phone ? [{ raw_number: prospectData.phone }] : [],
        present_raw_address: prospectData.location || '',
        industry: prospectData.industry || ''
      };

      const response = await axios.post(
        `${this.baseURL}/contacts`,
        contactPayload,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.contact) {
        console.log(`   ✅ Created LinkedIn contact: ${response.data.contact.id}`);
        return {
          success: true,
          apolloContactId: response.data.contact.id,
          contact: response.data.contact,
          enrichedEmail: email
        };
      } else {
        throw new Error('Invalid response from Apollo contact creation');
      }

    } catch (error) {
      console.error(`   ❌ LinkedIn contact creation failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // Process prospects for LinkedIn sequence
  async processLinkedInProspects(prospectIds) {
    try {
      console.log('🔄 Processing LinkedIn prospects...');
      console.log(`📋 Found ${prospectIds.length} prospects to process`);

      const results = {
        contactsCreated: 0,
        contactsSkipped: 0,
        validContactIds: []
      };

      for (const prospectId of prospectIds) {
        try {
          const prospect = await DatabaseService.getProspectById(prospectId);
          
          if (!prospect) {
            console.log(`⚠️ Prospect ${prospectId} not found`);
            results.contactsSkipped++;
            continue;
          }

          // Validate LinkedIn URL requirement
          if (!prospect.linkedinUrl) {
            console.log(`⚠️ ${prospect.firstName} ${prospect.lastName} - No LinkedIn URL, skipping`);
            results.contactsSkipped++;
            continue;
          }

          // Create Apollo contact if needed
          if (!prospect.apolloContactId) {
            const contactResult = await this.createLinkedInContact(prospect);
            
            if (contactResult.success) {
              // Update database with new Apollo Contact ID
              await DatabaseService.updateProspectStatus(
                prospectId,
                prospect.status,
                { 
                  apolloContactId: contactResult.apolloContactId,
                  email: contactResult.enrichedEmail
                }
              );
              
              results.validContactIds.push(contactResult.apolloContactId);
              results.contactsCreated++;
            } else {
              console.log(`   ❌ Failed to create contact for ${prospect.firstName}`);
              results.contactsSkipped++;
              continue;
            }
          } else {
            console.log(`✅ ${prospect.firstName} ${prospect.lastName} - Already has Apollo Contact ID`);
            results.validContactIds.push(prospect.apolloContactId);
          }

        } catch (error) {
          console.error(`❌ Error processing prospect ${prospectId}:`, error.message);
          results.contactsSkipped++;
        }
      }

      console.log(`📊 Contact Processing Results: ${results.contactsCreated} created, ${results.contactsSkipped} skipped`);
      return results;

    } catch (error) {
      console.error('❌ LinkedIn prospect processing failed:', error.message);
      throw error;
    }
  }

  // Add contacts to LinkedIn sequence
  async addToLinkedInSequence(contactIds) {
    try {
      if (!contactIds || contactIds.length === 0) {
        throw new Error('No contact IDs provided for LinkedIn sequence');
      }

      console.log(`🔗 Adding ${contactIds.length} contacts to LinkedIn sequence ${this.linkedinSequenceId}`);

      const response = await axios.post(
        `${this.baseURL}/emailer_campaigns/${this.linkedinSequenceId}/add_contact_ids`,
        {
          contact_ids: contactIds,
          emailer_campaign_id: this.linkedinSequenceId,
          send_email_from_email_account_id: this.mailboxId
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Successfully added ${contactIds.length} contacts to LinkedIn sequence`);
      
      return {
        success: true,
        addedCount: contactIds.length,
        apolloResponse: response.data
      };

    } catch (error) {
      console.error('❌ LinkedIn sequence addition failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Complete LinkedIn sequence workflow
  async sendProspectsToLinkedInSequence(prospectIds) {
    try {
      console.log('🚀 Starting complete LinkedIn sequence workflow...');
      
      // Step 1: Process prospects and create contacts
      const processingResult = await this.processLinkedInProspects(prospectIds);
      
      if (processingResult.validContactIds.length === 0) {
        return {
          success: false,
          message: 'No valid contacts with LinkedIn URLs to add to sequence',
          details: processingResult
        };
      }

      // Step 2: Add contacts to LinkedIn sequence
      const sequenceResult = await this.addToLinkedInSequence(processingResult.validContactIds);

      // Step 3: Update prospect statuses
      await this.updateProspectStatuses(prospectIds, 'CONNECTION_SENT');
      console.log('✅ Updated prospect statuses to CONNECTION_SENT');

      return {
        success: true,
        message: `Added ${processingResult.validContactIds.length} prospects to LinkedIn sequence`,
        details: {
          contactsCreated: processingResult.contactsCreated,
          contactsSkipped: processingResult.contactsSkipped,
          addedToSequence: processingResult.validContactIds.length,
          apolloResult: sequenceResult.apolloResponse
        }
      };

    } catch (error) {
      console.error('❌ LinkedIn sequence workflow failed:', error.message);
      return {
        success: false,
        message: error.message,
        error: error.response?.data || error.message
      };
    }
  }

  // Update prospect statuses in database
  async updateProspectStatuses(prospectIds, status) {
    try {
      for (const prospectId of prospectIds) {
        await DatabaseService.updateProspectStatus(
          prospectId,
          status,
          {
            lastInteraction: new Date(),
            linkedinSequenceAdded: new Date()
          }
        );
      }
    } catch (error) {
      console.error('❌ Failed to update prospect statuses:', error.message);
    }
  }

  // Generate email from prospect data
  generateEmail(prospect) {
    if (!prospect.company || !prospect.firstName || !prospect.lastName) {
      return null;
    }
    
    const domain = prospect.company.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/inc|llc|corp|ltd|company|group/g, '') + '.com';
      
    const firstName = prospect.firstName.toLowerCase();
    const lastName = prospect.lastName.toLowerCase();
    
    return `${firstName}.${lastName}@${domain}`;
  }

  // Validate LinkedIn sequence configuration
  async validateConfiguration() {
    try {
      console.log('🔧 Validating LinkedIn sequence configuration...');
      
      // Check sequences
      const sequences = await this.getSequences();
      const targetSequence = sequences.find(seq => seq.id === this.linkedinSequenceId);
      
      if (!targetSequence) {
        throw new Error(`LinkedIn sequence ${this.linkedinSequenceId} not found`);
      }

      // Check email accounts
      const emailAccounts = await this.getEmailAccounts();
      const targetMailbox = emailAccounts.find(acc => acc.id === this.mailboxId);
      
      if (!targetMailbox) {
        throw new Error(`Mailbox ${this.mailboxId} not found`);
      }

      console.log('✅ LinkedIn sequence configuration is valid');
      return {
        valid: true,
        sequence: targetSequence,
        mailbox: targetMailbox
      };

    } catch (error) {
      console.error('❌ Configuration validation failed:', error.message);
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = ApolloLinkedInSequenceService;
