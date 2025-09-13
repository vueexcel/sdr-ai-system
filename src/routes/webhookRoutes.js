// routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const HubSpotEmailService = require('../services/hubspotEmail');

// Main webhook endpoint called by n8n
router.post('/expandi-webhook', async (req, res) => {
  try {
    // Extract data from n8n webhook body
    const webhookData = req.body;
    const contact = webhookData.body?.contact;
    const hookName = webhookData.body?.hook?.name;
    
    console.log('📡 Received webhook data:', JSON.stringify(webhookData, null, 2));
    
    if (!contact?.email) {
      console.log('❌ Missing contact email in webhook data');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing contact email',
        received_data: webhookData
      });
    }

    // Convert hook name to proper email action
    const emailAction = convertHookNameToAction(hookName);
    
    console.log(`📧 Processing: ${emailAction} for ${contact.email}`);

    // Find HubSpot contact
    const hubspotContact = await HubSpotEmailService.findContactByEmail(contact.email);
    
    if (!hubspotContact) {
      console.log(`❌ Contact not found in HubSpot: ${contact.email}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Contact not found in HubSpot',
        email: contact.email,
        suggestion: 'Create this contact in HubSpot first or enable auto-creation'
      });
    }

    // Update HubSpot with email action
    const updateResult = await HubSpotEmailService.updateEmailAction(
      hubspotContact.id, 
      emailAction, 
      contact
    );

    console.log(`✅ Successfully updated ${contact.email} with action: ${emailAction}`);
    
    res.json({
      success: true,
      message: 'Email action updated successfully',
      email: contact.email,
      action: emailAction,
      hubspot_contact_id: hubspotContact.id,
      updated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Convert Expandi hook names to exact HubSpot radio button values
function convertHookNameToAction(hookName) {
  const hookMap = {
    'Email-sent': 'Email sent',         // ✅ Matches HubSpot option 1
    'Email-opened': 'Email opened',     // ✅ Matches HubSpot option 4
    'Email-open': 'Email open',         // ✅ Matches HubSpot option 2  
    'Email-replied': 'Email sent',      // No "replied" option, use "sent"
    'Email-bounced': 'Email bounced',   // ✅ Matches HubSpot option 3
    'Email-clicked': 'Email opened'     // No "clicked" option, use "opened"
  };
  
  const mappedAction = hookMap[hookName];
  
  if (!mappedAction) {
    console.warn(`⚠️ Unknown hook name: ${hookName}, using default 'Email sent'`);
    return 'Email sent';
  }
  
  console.log(`🔄 Converted hook "${hookName}" to action "${mappedAction}"`);
  return mappedAction;
}

// Health check endpoint for webhook
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhook-handler',
    timestamp: new Date().toISOString(),
    endpoints: {
      main_webhook: '/api/webhook/expandi-webhook',
      health_check: '/api/webhook/health'
    }
  });
});

// Test endpoint for debugging
router.post('/test', async (req, res) => {
  try {
    const testData = {
      body: {
        contact: {
          email: req.body.email || 'test@example.com'
        },
        hook: {
          name: req.body.hook_name || 'Email-sent'
        }
      }
    };

    // Simulate the main webhook call
    console.log('🧪 Testing webhook with data:', testData);
    
    const contact = testData.body.contact;
    const hookName = testData.body.hook.name;
    const emailAction = convertHookNameToAction(hookName);
    
    res.json({
      success: true,
      message: 'Test data processed',
      test_input: testData,
      converted_action: emailAction,
      would_update_contact: contact.email
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available email actions
router.get('/actions', (req, res) => {
  const actions = [
    { hubspot_value: 'Email sent', expandi_hooks: ['Email-sent'] },
    { hubspot_value: 'Email open', expandi_hooks: ['Email-open'] },
    { hubspot_value: 'Email opened', expandi_hooks: ['Email-opened', 'Email-clicked'] },
    { hubspot_value: 'Email bounced', expandi_hooks: ['Email-bounced'] }
  ];

  res.json({
    success: true,
    available_actions: actions,
    total_actions: actions.length
  });
});

module.exports = router;
