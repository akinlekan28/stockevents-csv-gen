const express = require('express');
import { Request, Response } from 'express'; 
const { filterStocks, generateAllDataCSV } = require('./stockFilter');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config(); // Load environment variables

const app = express();
const port = process.env.PORT || 6000;

app.use(express.json());

app.get('/api', async (req: Request, res: Response) => {
  try {
    return res.json({ message: 'Hello, world!' });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files from the 'downloads' directory
app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')));

app.post('/api/generate-csv', async (req: Request, res: Response) => {
  try {
    const { allDataFile } = req.body;

    if (!allDataFile) {
      return res.status(400).json({ error: 'Missing required file names' });
    }

    const result = await generateAllDataCSV(allDataFile);
    
    // Generate download URL
    const downloadUrl = `${req.protocol}://${req.get('host')}/downloads/${path.basename(result.outputFile)}`;

    res.json({
      ...result,
      downloadUrl
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/filter-stocks', async (req: Request, res: Response) => {
  try {
    const { allDataFile, pieFile, outputFile } = req.body;

    if (!allDataFile || !pieFile || !outputFile) {
      return res.status(400).json({ error: 'Missing required file names' });
    }

    const result = await filterStocks(allDataFile, pieFile, outputFile);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});