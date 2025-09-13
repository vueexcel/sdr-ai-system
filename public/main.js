document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const searchQueryInput = document.getElementById('search-query');
  const campaignSelect = document.getElementById('campaign-select');
  const limitSelect = document.getElementById('limit-select');
  const saveToDbCheckbox = document.getElementById('save-to-db');
  const revealEmailsCheckbox = document.getElementById('reveal-emails');
  const assignToExpandiCheckbox = document.getElementById('assign-to-expandi');
  const assignToHubspotCheckbox = document.getElementById('assign-to-hubspot');
  const searchButton = document.getElementById('search-button');
  const loadingElement = document.getElementById('loading');
  const resultsContainer = document.getElementById('results-container');
  const summaryContent = document.getElementById('summary-content');
  const prospectsList = document.getElementById('prospects-list');
  const campaignResults = document.getElementById('campaign-results');

  // Campaign configurations
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

  // Event Listeners
  searchButton.addEventListener('click', handleSearch);

  // Search function
  async function handleSearch() {
    const searchQuery = searchQueryInput.value.trim();
    if (!searchQuery) {
      alert('Please enter a search query');
      return;
    }

    const selectedCampaign = campaignSelect.value;
    const config = campaignConfigs[selectedCampaign];
    
    const options = {
      limit: parseInt(limitSelect.value),
      saveToDatabase: saveToDbCheckbox.checked,
      revealPersonalEmails: revealEmailsCheckbox.checked,
      assignToExpandi: assignToExpandiCheckbox.checked,
      campaignInstanceId: config.campaignInstanceId,
      customFields: config.customFields,
      assignToHubSpot: assignToHubspotCheckbox.checked
    };

    // Show loading, hide results
    loadingElement.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    
    try {
      const response = await fetch('/api/prospects/search-and-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          searchQuery,
          options
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'An error occurred while processing your request');
      }
      
      displayResults(data, selectedCampaign);
    } catch (error) {
      console.error('Error:', error);
      summaryContent.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    } finally {
      // Hide loading, show results
      loadingElement.classList.add('hidden');
      resultsContainer.classList.remove('hidden');
    }
  }

  // Display results function
  function displayResults(results, selectedCampaign) {
    // Display summary
    let summaryHTML = `
      <p><strong>Campaign:</strong> ${selectedCampaign.toUpperCase()}</p>
      <p><strong>Original Input:</strong> "${results.originalInput}"</p>
    `;
    
    if (results.parsedCriteria) {
      summaryHTML += `<p><strong>Parsed Criteria:</strong></p>
      <pre>${JSON.stringify(results.parsedCriteria, null, 2)}</pre>`;
    }
    
    summaryHTML += `<div class="stats">
      <div class="stat-item">🔍 Prospects Found: ${results.prospects?.length || 0}</div>
      <div class="stat-item">✨ Prospects Enriched: ${results.enrichedCount || 0}</div>
    `;
    
    if (results.databaseResult) {
      const { saved, updated, skipped } = results.databaseResult;
      summaryHTML += `
        <div class="stat-item">💾 Database: ${saved} new, ${updated} updated, ${skipped} skipped</div>
      `;
    }
    
    if (results.expandiResult) {
      const { successful, failed } = results.expandiResult;
      summaryHTML += `
        <div class="stat-item">🚀 Expandi: ${successful} assigned, ${failed} failed</div>
      `;
    }
    
    summaryHTML += `</div>`;
    summaryContent.innerHTML = summaryHTML;
    
    // Display prospects
    if (results.prospects && results.prospects.length > 0) {
      let prospectsHTML = '';
      
      results.prospects.forEach((prospect, index) => {
        prospectsHTML += `
          <div class="prospect-card">
            <h4>${index + 1}. ${prospect.first_name} ${prospect.last_name || ''}</h4>
            <p><strong>Title:</strong> ${prospect.title || 'N/A'}</p>
            <p><strong>Company:</strong> ${prospect.organization?.name || 'N/A'}</p>
            <p><strong>LinkedIn:</strong> ${prospect.linkedin_url || 'N/A'}</p>
            <p><strong>Email:</strong> ${prospect.email || 'N/A'}</p>
            <p><strong>Apollo ID:</strong> ${prospect.id || 'N/A'}</p>
          </div>
        `;
      });
      
      prospectsList.innerHTML = prospectsHTML;
    } else {
      prospectsList.innerHTML = '<p>No prospects were found for this search query.</p>';
    }
    
    // Display campaign results
    if (results.expandiResult && results.expandiResult.successfulProspects && results.expandiResult.successfulProspects.length > 0) {
      let campaignHTML = `<p>Prospects assigned to campaign ${results.expandiResult.campaignInstanceId}:</p>`;
      
      results.expandiResult.successfulProspects.forEach((prospect, index) => {
        campaignHTML += `
          <div class="prospect-card">
            <h4>${index + 1}. ${prospect.firstName} ${prospect.lastName || ''}</h4>
            <p><strong>LinkedIn:</strong> ${prospect.linkedinUrl || 'N/A'}</p>
            <p><strong>Company:</strong> ${prospect.company || 'N/A'}</p>
            <p class="success">✅ Successfully assigned to campaign</p>
          </div>
        `;
      });
      
      campaignResults.innerHTML = campaignHTML;
    } else if (results.options && results.options.assignToExpandi) {
      campaignResults.innerHTML = `<p>Assignment requested for campaign ${results.options.campaignInstanceId}, but no prospects were eligible.</p>`;
    } else {
      campaignResults.innerHTML = '<p>No campaign assignment was requested.</p>';
    }
  }
});