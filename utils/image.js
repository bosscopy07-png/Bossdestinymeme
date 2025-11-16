/**
 * utils/image.js
 *
 * Generates PnL or other charts/images for signals.
 * Uses quickchart.io API.
 */

import fs from "fs";
import path from "path";
import QuickChart from "quickchart-js";

export async function generatePnLImage(data = [], filename = "pnl.png") {
  // data: array of numbers, e.g., PnL values over time
  const chart = new QuickChart();
  chart.setConfig({
    type: 'line',
    data: {
      labels: data.map((_, i) => `T${i+1}`),
      datasets: [{
        label: 'PnL',
        data,
        fill: true,
        backgroundColor: 'rgba(75,192,192,0.2)',
        borderColor: 'rgba(75,192,192,1)',
        borderWidth: 2,
      }]
    },
    options: {
      plugins: {
        legend: { display: true }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
  
  const filePath = path.join(process.cwd(), filename);
  const chartBuffer = await chart.toBinary(); // fetch image buffer
  fs.writeFileSync(filePath, chartBuffer);
  return filePath;
}
