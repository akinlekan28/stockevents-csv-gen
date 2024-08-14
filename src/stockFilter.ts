const csv = require('csv-parser');
const fs = require('fs').promises;
const { createReadStream } = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

interface Stock {
  Symbol: string;
  Date: string;
  Quantity: number;
  Price: number;
}

interface RawStockData {
  Ticker: string;
  Time: string;
  Action: string;
  'No. of shares': string;
  'Price / share': string;
  'Currency (Price / share)': string;
  'Exchange rate': string;
}

interface PieStock {
  Symbol: string;
  InvestedValue: number;
}

async function readPieData(pieFile: string): Promise<Map<string, number>> {
  const pieData = new Map<string, number>();
  return new Promise((resolve, reject) => {
    createReadStream(pieFile)
      .pipe(csv())
      .on('data', (row: any) => {
        const symbol = row.Slice;
        const investedValue = parseFloat(row.InvestedValue || row['Invested value']);
        if (!isNaN(investedValue)) {
          pieData.set(symbol, investedValue);
        }
      })
      .on('end', () => resolve(pieData))
      .on('error', reject);
  });
}

export async function filterStocks(allDataFile: string, pieFile: string, outputFile: string) {
  try {
    const pieData: Map<string, number> = await readPieData(pieFile);
    const filteredStocks: Stock[] = await filterAllData(allDataFile, pieData);
    
    const outputDir = path.dirname(outputFile);
    const outputFileName = path.basename(outputFile, path.extname(outputFile));
    const newOutputFile = path.join(outputDir, `${outputFileName}_filtered_${Date.now()}.csv`);
    
    await writeFilteredStocks(newOutputFile, filteredStocks);

    const totalInvested = calculateTotalInvested(pieData);

    return { 
      message: 'Filtering complete', 
      totalInvested: totalInvested.toFixed(2),
      outputFile: newOutputFile
    };
  } catch (error) {
    console.error('Error in filterStocks:', error);
    throw error;
  }
}

export async function generateAllDataCSV(allDataFile: string) {
  try {
    const allStocks: RawStockData[] = await readAllStocks(allDataFile);
    
    // Generate the output file name
    const outputDir = path.join(__dirname, '..', 'downloads'); // Change the output directory
    await fs.mkdir(outputDir, { recursive: true }); // Ensure the directory exists
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
    const newOutputFile = path.join(outputDir, `generated_file_${currentDate}_${currentTime}.csv`);

    // Process and filter the data
    const processedStocks = allStocks
      .filter(stock => stock.Action === 'Market buy' || stock.Action === 'Market sell')
      .map(stock => {
        const quantity = parseFloat(stock['No. of shares']);
        return {
          Symbol: stock.Ticker,
          Date: formatDate(stock.Time),
          Quantity: stock.Action === 'Market sell' ? -quantity : quantity,
          Price: parseFloat(stock['Price / share'])
        };
      });

    await writeProcessedStocks(newOutputFile, processedStocks);

    return {
      message: 'CSV generation complete',
      outputFile: newOutputFile
    };
  } catch (error) {
    console.error('Error generating CSV:', error);
    throw error;
  }
}

async function filterAllData(allDataFile: string, pieData: Map<string, number>): Promise<Stock[]> {
  const allStocks: RawStockData[] = await readAllStocks(allDataFile);
  const filteredStocks: Stock[] = [];
  const stockTotals = new Map<string, number>();

  // Sort stocks by date, most recent first
  allStocks.sort((a, b) => new Date(b.Time).getTime() - new Date(a.Time).getTime());

  for (const row of allStocks) {
    if (pieData.has(row.Ticker)) {
      const quantity = parseFloat(row['No. of shares']);
      const price = parseFloat(row['Price / share']);
      const exchangeRate = parseFloat(row['Exchange rate']);
      
      if (!isNaN(quantity) && !isNaN(price)) {
        let convertedPrice = price;
        if (row['Currency (Price / share)'] !== 'GBP' && !isNaN(exchangeRate)) {
          convertedPrice = price * exchangeRate;
        }
        
        const stockValue = quantity * convertedPrice;
        const currentTotal = stockTotals.get(row.Ticker) || 0;
        const newTotal = currentTotal + stockValue;
        const investedValue = pieData.get(row.Ticker)!;

        if (newTotal <= investedValue) {
          const formattedDate = formatDate(row.Time);
          
          filteredStocks.push({
            Symbol: row.Ticker,
            Date: formattedDate,
            Quantity: quantity,
            Price: convertedPrice
          });

          stockTotals.set(row.Ticker, newTotal);
        } else if (currentTotal < investedValue) {
          // Partial inclusion of the transaction
          const remainingValue = investedValue - currentTotal;
          const partialQuantity = remainingValue / convertedPrice;
          
          filteredStocks.push({
            Symbol: row.Ticker,
            Date: formatDate(row.Time),
            Quantity: partialQuantity,
            Price: convertedPrice
          });

          stockTotals.set(row.Ticker, investedValue);
        }

        // Stop processing this stock if we've reached or exceeded the invested value
        if (newTotal >= investedValue) {
          pieData.delete(row.Ticker);
        }
      }
    }
  }

  return filteredStocks;
}

async function readAllStocks(allDataFile: string): Promise<RawStockData[]> {
  return new Promise((resolve, reject) => {
    const stocks: RawStockData[] = [];
    createReadStream(allDataFile)
      .pipe(csv())
      .on('data', (row: RawStockData) => stocks.push(row))
      .on('end', () => resolve(stocks))
      .on('error', reject);
  });
}

async function writeFilteredStocks(outputFile: string, filteredStocks: Stock[]) {
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'Symbol', title: 'Symbol' },
      { id: 'Date', title: 'Date' },
      { id: 'Quantity', title: 'Quantity' },
      { id: 'Price', title: 'Price' }
    ]
  });

  await csvWriter.writeRecords(filteredStocks);
}

async function writeProcessedStocks(outputFile: string, stocks: any[]) {
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'Symbol', title: 'Symbol' },
      { id: 'Date', title: 'Date' },
      { id: 'Quantity', title: 'Quantity' },
      { id: 'Price', title: 'Price' }
    ]
  });

  await csvWriter.writeRecords(stocks);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function calculateTotalInvested(pieData: Map<string, number>): number {
  return Array.from(pieData.values()).reduce((sum, value) => sum + value, 0);
}