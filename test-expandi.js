const ApolloService = require('./src/services/apollo');

async function main() {
  // Define campaign configurations for different verticals
  const campaignConfigs = {
    brandfy_ai: {
      campaignInstanceId: '725871',
      customFields: {
        campaign_type: 'brandfy_ai',
        vertical: 'design_services',
        source: 'apollo_search'
      }
    },
    defi_fund: {
      campaignInstanceId: '723802', 
      customFields: {
        campaign_type: 'defi_fund',
        vertical: 'institutional_investors',
        source: 'apollo_search'
      }
    },
    personal_injury: {
      campaignInstanceId: '723803',
      customFields: {
        campaign_type: 'personal_injury',
        vertical: 'legal_services', 
        source: 'apollo_search'
      }
    }
  };

  // SELECT WHICH CAMPAIGN TO TEST HERE
  const selectedCampaign = 'brandfy_ai'; // Change this to test different campaigns
  const config = campaignConfigs[selectedCampaign];

  // SINGLE SEARCH QUERY INPUT - CHANGE THIS TO TEST DIFFERENT SEARCHES
  const searchQuery = "graphic designers in chennai, india";
  
  const options = {
    limit: 2,
    saveToDatabase: true,
    revealPersonalEmails: false,
    assignToExpandi: true,
    campaignInstanceId: config.campaignInstanceId, // Dynamic campaign ID
    customFields: config.customFields, // Dynamic custom fields
    assignToHubSpot: true
  };

  try {
    const apolloService = new ApolloService();
    
    console.log('🚀 Starting combined search, enrich, and multi-platform assignment test...');
    console.log(`📊 Testing Campaign: ${selectedCampaign.toUpperCase()}`);
    console.log(`🎯 Target Campaign ID: ${config.campaignInstanceId}`);
    console.log(`🔍 Search Query: "${searchQuery}"`);
    console.log(`📋 Custom Fields: ${JSON.stringify(config.customFields, null, 2)}`);
    console.log('='.repeat(80));
    
    // Use the single search query input
    const results = await apolloService.searchAndEnrichAndAssign(
      searchQuery, // Single input query
      options 
    );
    
    console.log(`\n\n--- ✅ Test Run Summary ---`);
    console.log(`Campaign: ${selectedCampaign.toUpperCase()}`);
    console.log(`Original Input: "${results.originalInput}"`);
    
    if (results.parsedCriteria) {
      console.log(`Parsed Criteria: ${JSON.stringify(results.parsedCriteria, null, 2)}`);
    }

    console.log(`\n--- Workflow Results ---`);
    console.log(`🔍 Prospects Found via Apollo Search: ${results.prospects.length}`);
    console.log(`✨ Prospects Enriched with Email/Phone: ${results.enrichedCount}`);
    
    if (results.databaseResult) {
      const { saved, updated, skipped } = results.databaseResult;
      console.log(`💾 Database: ${saved} new prospects saved, ${updated} updated, ${skipped} skipped.`);
    }

    if (results.expandiResult) {
      const { successful, failed } = results.expandiResult;
      console.log(`🚀 Expandi Campaign ${config.campaignInstanceId}: ${successful} prospects assigned successfully, ${failed} failed.`);
      
      // Show which prospects were assigned to which campaign
      if (results.expandiResult.successfulProspects && results.expandiResult.successfulProspects.length > 0) {
        console.log(`\n--- 🎯 Prospects Assigned to Campaign ${config.campaignInstanceId} ---`);
        results.expandiResult.successfulProspects.forEach((prospect, index) => {
          console.log(`${index + 1}. ${prospect.firstName} ${prospect.lastName || ''} → Campaign ${config.campaignInstanceId}`);
          console.log(`   LinkedIn: ${prospect.linkedinUrl}`);
          console.log(`   Company: ${prospect.company || 'N/A'}`);
        });
      }
    } else if (options.assignToExpandi) {
        console.log(`🚀 Expandi: Assignment requested for campaign ${config.campaignInstanceId}, but no prospects were eligible.`);
    }

    if (options.assignToHubSpot) {
        console.log(`🏢 HubSpot: Sync was requested. Check logs above for "HubSpot sync complete."`);
    }
    
    console.log(`\n--- Sample Prospects Found ---`);
    if (results.prospects && results.prospects.length > 0) {
        results.prospects.slice(0, 3).forEach((p, index) => {
            console.log(`${index + 1}. ${p.first_name} ${p.last_name}`);
            console.log(`   - Title: ${p.title}`);
            console.log(`   - Company: ${p.organization?.name}`);
            console.log(`   - LinkedIn: ${p.linkedin_url || 'N/A'}`);
            console.log(`   - Email: ${p.email || 'N/A'}`);
            console.log(`   - Apollo ID: ${p.id || 'N/A'}`);
        });
    } else {
        console.log('No prospects were found for this search query.');
    }

    await apolloService.disconnect();
    console.log(`\n\n--- 🏁 Test complete for ${selectedCampaign.toUpperCase()} campaign. Prisma disconnected. ---`);

  } catch (error) {
    console.error('❌ A critical error occurred in the test script:', error);
  }
}

main();
