const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

class ExpandiService {
  constructor() {
    this.prisma = new PrismaClient();
    this.campaignInstanceId = '723802';
    this.apiKey = process.env.EXPANDI_API_KEY;
    this.apiSecret = process.env.EXPANDI_API_SECRET;
    this.baseURL = 'https://api.liaufa.com/api/v1/open-api';
  }

  /**
   * Assign a prospect to an Expandi campaign
   * @param {Object} prospect - The prospect to assign
   * @param {string} prospect.linkedinUrl - LinkedIn profile URL (required)
   * @param {string} prospect.firstName - First name of the prospect
   * @param {string} prospect.company - Company name of the prospect
   * @param {Object} customFields - Additional custom fields to include
   * @param {string} campaignInstanceId - Optional campaign instance ID (defaults to constructor value)
   * @returns {Promise<Object>} - Response from Expandi API
   */
  async assignProspectToCampaign(prospect, customFields = {}, campaignInstanceId = this.campaignInstanceId) {
    try {
      if (!prospect.linkedinUrl) {
        throw new Error('LinkedIn profile URL is required');
      }

      // Prepare the payload
      const payload = {
        profile_link: prospect.linkedinUrl,
        first_name: prospect.firstName || '',
        company_name: prospect.company || '',
        email: (prospect.email && prospect.email !== 'email_not_unlocked@domain.com') ? prospect.email: '',
        ...customFields
      };

      console.log(`🔗 Assigning prospect ${prospect.firstName} to Expandi campaign ${campaignInstanceId}...`);
      
      const url = `${this.baseURL}/campaign-instance/${campaignInstanceId}/assign/?key=${this.apiKey}&secret=${this.apiSecret}`;
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Successfully assigned prospect to campaign: ${prospect.firstName}`);
      
      // If the prospect has an ID in our database, update their status
      if (prospect.id) {
        await this.prisma.prospect.update({
          where: { id: prospect.id },
          data: { 
            status: 'IN_CAMPAIGN',
            expandiCampaignId: campaignInstanceId,
            updatedAt: new Date()
          }
        });
        console.log(`📝 Updated prospect status to IN_CAMPAIGN in database`);
      }

      return {
        success: true,
        data: response.data,
        prospect: prospect
      };
} catch (error) {
  // ✅ Enhanced error logging
  console.error(`❌ Error assigning prospect to Expandi campaign:`);
  console.error(`   Prospect: ${prospect.firstName} ${prospect.lastName}`);
  console.error(`   LinkedIn URL: ${prospect.linkedinUrl}`);
  console.error(`   Error message: ${error.message}`);
  
  if (error.response) {
    console.error(`   Status: ${error.response.status}`);
    console.error(`   Response data:`, error.response.data);
    console.error(`   Response headers:`, error.response.headers);
  }
  
  return {
    success: false,
    error: error.message,
    prospect: prospect,
    fullError: error.response?.data || error  // Include full error details
  };
}

  }

  /**
   * Assign multiple prospects to an Expandi campaign
   * @param {Array<Object>} prospects - Array of prospects to assign
   * @param {Object} customFields - Additional custom fields to include for all prospects
   * @param {string} campaignInstanceId - Optional campaign instance ID
   * @returns {Promise<Object>} - Results of the batch assignment
   */
  async assignProspectsBatch(prospects, customFields = {}, campaignInstanceId = this.campaignInstanceId) {
    try {
      console.log(`🔄 Assigning ${prospects.length} prospects to Expandi campaign ${campaignInstanceId}...`);
      
      const results = {
        total: prospects.length,
        successful: 0,
        failed: 0,
        errors: [],
        successfulProspects: [],
        failedProspects: []
      };

      for (const prospect of prospects) {
        const result = await this.assignProspectToCampaign(prospect, customFields, campaignInstanceId);
        
        if (result.success) {
          results.successful++;
          results.successfulProspects.push(prospect);
        } else {
          results.failed++;
          results.errors.push(result.error);
          results.failedProspects.push(prospect);
        }
      }

      console.log(`✅ Batch assignment complete: ${results.successful} successful, ${results.failed} failed`);
      return results;
    } catch (error) {
      console.error(`❌ Error in batch assignment:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Pause a campaign for a specific contact
   * @param {string} campaignContactId - The campaign contact ID
   * @returns {Promise<Object>} - Response from Expandi API
   */
  async pauseCampaign(campaignContactId) {
    try {
      if (!campaignContactId) {
        throw new Error('Campaign contact ID is required');
      }

      console.log(`⏸️ Pausing campaign for contact ID: ${campaignContactId}...`);
      
      const url = `${this.baseURL}/campaign-contact/${campaignContactId}/pause/?key=${this.apiKey}&secret=${this.apiSecret}`;
      
      const response = await axios.get(url);

      console.log(`✅ Successfully paused campaign for contact ID: ${campaignContactId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error(`❌ Error pausing campaign:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Resume a campaign for a specific contact
   * @param {string} campaignContactId - The campaign contact ID
   * @returns {Promise<Object>} - Response from Expandi API
   */
  async resumeCampaign(campaignContactId) {
    try {
      if (!campaignContactId) {
        throw new Error('Campaign contact ID is required');
      }

      console.log(`▶️ Resuming campaign for contact ID: ${campaignContactId}...`);
      
      const url = `${this.baseURL}/campaign-contact/${campaignContactId}/resume/?key=${this.apiKey}&secret=${this.apiSecret}`;
      
      const response = await axios.get(url);

      console.log(`✅ Successfully resumed campaign for contact ID: ${campaignContactId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error(`❌ Error resuming campaign:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Assign prospects from database to Expandi campaign based on status
   * @param {string} status - The prospect status to filter by (e.g., 'NEW', 'QUALIFIED')
   * @param {number} limit - Maximum number of prospects to assign
   * @param {Object} customFields - Additional custom fields to include
   * @param {string} campaignInstanceId - Optional campaign instance ID
   * @returns {Promise<Object>} - Results of the assignment
   */
  async assignProspectsFromDatabase(status = 'NEW', limit = 10, customFields = {}, campaignInstanceId = this.campaignInstanceId) {
    try {
      console.log(`🔍 Finding prospects with status ${status} to assign to Expandi campaign...`);
      
      // Get prospects from database with the specified status and LinkedIn URL
      const prospects = await this.prisma.prospect.findMany({
        where: {
          status: status,
          linkedinUrl: { not: null } // Must have LinkedIn URL
        },
        take: limit,
        orderBy: { updatedAt: 'desc' }
      });

      if (prospects.length === 0) {
        console.log(`⚠️ No prospects with status ${status} and LinkedIn URL found in database`);
        return {
          success: false,
          error: `No prospects with status ${status} and LinkedIn URL found`,
          total: 0
        };
      }

      console.log(`📋 Found ${prospects.length} prospects to assign to Expandi campaign`);
      
      // Assign the prospects to the campaign
      return await this.assignProspectsBatch(prospects, customFields, campaignInstanceId);
    } catch (error) {
      console.error(`❌ Error assigning prospects from database:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ExpandiService;