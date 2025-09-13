// routes/webhookRoutes.js
const express = require('express');
const router = express.Router();
const HubSpotEmailService = require('../services/hubspotEmail');

router.post('/expandi-webhook', async (req, res) => {
  try {
    const { contact, email_action } = req.body;
    
    if (!contact?.email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing contact email' 
      });
    }

    // Convert hook name to proper email action
    const emailAction = convertHookNameToAction(email_action);
    
    console.log(`📧 Processing: ${emailAction} for ${contact.email}`);

    // Find HubSpot contact
    const hubspotContact = await HubSpotEmailService.findContactByEmail(contact.email);
    
    if (!hubspotContact) {
      console.log(`❌ Contact not found in HubSpot: ${contact.email}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Contact not found in HubSpot',
        email: contact.email
      });
    }

    // Update HubSpot with email action
    await HubSpotEmailService.updateEmailAction(
      hubspotContact.id, 
      emailAction, 
      contact
    );

    console.log(`✅ Updated ${contact.email} with action: ${emailAction}`);
    
    res.json({
      success: true,
      message: 'Email action updated successfully',
      email: contact.email,
      action: emailAction,
      hubspot_contact_id: hubspotContact.id
    });

  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
});

// Convert Expandi hook names to your email actions
function convertHookNameToAction(hookName) {
  const hookMap = {
    'Email-sent': 'Email sent',
    'Email-opened': 'Email opened', 
    'Email-replied': 'Email replied',
    'Email-bounced': 'Email bounced',
    'Email-clicked': 'Email clicked'
  };
  
  return hookMap[hookName] || hookName;
}

module.exports = router;
