const express = require('express');
const router = express.Router();
const ApolloEmailSequenceService = require('../services/apolloEmailSequence');

const apolloEmailService = new ApolloEmailSequenceService();

// Get all available sequences
router.get('/', async (req, res) => {
  try {
    const sequences = await apolloEmailService.getSequences();
    res.json(sequences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all email accounts - MOVED THIS ROUTE BEFORE THE /:id ROUTE
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await apolloEmailService.getEmailAccounts();
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific sequence
router.get('/:id', async (req, res) => {
  try {
    const sequence = await apolloEmailService.getSequenceById(req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }
    res.json(sequence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add prospects to a sequence
router.post('/:id/add-prospects', async (req, res) => {
  try {
    const { prospectIds, emailAccountId = process.env.APOLLO_MAILBOX_ID } = req.body;
    
    if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
      return res.status(400).json({ error: 'Valid prospect IDs array is required' });
    }
    
    if (!emailAccountId) {
      return res.status(400).json({ error: 'Email account ID is required' });
    }
    
    const result = await apolloEmailService.sendEmailsToProspects(
      prospectIds, 
      req.params.id || process.env.APOLLO_SEQUENCE_ID,
      emailAccountId
    );
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;