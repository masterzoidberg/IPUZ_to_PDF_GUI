// single-convert.js - A simplified converter for a single file
// Save this in your project folder and use it with the batch script

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node single-convert.js <input.ipuz> <output.pdf> [options]');
  process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1];
const options = {};

// Parse options
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--fontSize' && args[i + 1]) {
    options.fontSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--fontFamily' && args[i + 1]) {
    options.fontFamily = args[i + 1];
    i++;
  } else if (args[i] === '--clueColumns' && args[i + 1]) {
    options.clueColumns = args[i + 1];
    i++;
  } else if (args[i] === '--includeCopyright') {
    options.includeCopyright = true;
  } else if (args[i] === '--includeSolution') {
    options.includeSolution = true;
  }
}

// Normalize IPUZ data to handle different formats
function normalizeIpuzData(ipuzData) {
  const normalized = {
    title: ipuzData.title || "Crossword Puzzle",
    author: ipuzData.author || "",
    copyright: ipuzData.copyright || "",
    puzzle: [],
    solution: ipuzData.solution || [],
    clues: {
      Across: [],
      Down: []
    }
  };
  
  // Normalize puzzle grid
  if (ipuzData.puzzle && Array.isArray(ipuzData.puzzle)) {
    normalized.puzzle = ipuzData.puzzle.map(row => {
      return row.map(cell => {
        if (cell === "#" || cell === 0 || cell === null) {
          return "#"; // Black cell
        } else if (typeof cell === 'object' && cell.cell) {
          return { cell: cell.cell }; // Format 1: {cell: number}
        } else if (typeof cell === 'number') {
          return { cell: cell }; // Format 2: direct number
        } else if (cell === ":") {
          return { cell: 0 }; // Empty cell in Format 2
        } else {
          return { cell: 0 }; // Default to empty
        }
      });
    });
  }
  
  // Normalize clues
  if (ipuzData.clues) {
    // Handle Across clues
    if (ipuzData.clues.Across) {
      normalized.clues.Across = Array.isArray(ipuzData.clues.Across) ? 
        // Format 1: [[number, text], [number, text]]
        ipuzData.clues.Across.map(clue => {
          if (Array.isArray(clue)) {
            return [clue[0], clue[1]];
          } else if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean) :
        // Format 2: [{number, clue}, {number, clue}]
        Object.values(ipuzData.clues.Across).map(clue => {
          if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean);
    }
    
    // Handle Down clues
    if (ipuzData.clues.Down) {
      normalized.clues.Down = Array.isArray(ipuzData.clues.Down) ? 
        ipuzData.clues.Down.map(clue => {
          if (Array.isArray(clue)) {
            return [clue[0], clue[1]];
          } else if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean) :
        Object.values(ipuzData.clues.Down).map(clue => {
          if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean);
    }
  }
  
  return normalized;
}

// Main conversion function
async function convertToPdf() {
  try {
    console.log(`Converting ${inputFile} to ${outputFile}`);
    
    // Read and parse the IPUZ file
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    const rawData = JSON.parse(fileContent);
    const ipuzData = normalizeIpuzData(rawData);
    
    // Default options
    const fontSize = options.fontSize || 18;
    const fontFamily = options.fontFamily || 'times';
    const includeCopyright = options.includeCopyright || false;
    const includeSolution = options.includeSolution || false;
    const numColumns = options.clueColumns ? parseInt(options.clueColumns, 10) : 1;
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Get fonts
    let font, boldFont;
    if (fontFamily === 'helvetica') {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    } else if (fontFamily === 'courier') {
      font = await pdfDoc.embedFont(StandardFonts.Courier);
      boldFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
    } else { // default to times
      font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    }
    
    // Page setup
    const pageWidth = 8.5 * 72; // Letter width
    const pageHeight = 11 * 72; // Letter height
    const margin = 50;
    const lineHeight = fontSize * 1.5;
    
    // Column setup
    const columnGap = margin * 0.6;
    const columnWidth = (pageWidth - (2 * margin) - ((numColumns - 1) * columnGap)) / numColumns;
    
    // Create pages
    // 1. Grid page
    const gridPage = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Add title
    const title = ipuzData.title || path.basename(inputFile, '.ipuz');
    const titleWidth = boldFont.widthOfTextAtSize(title, fontSize * 1.5);
    
    gridPage.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: pageHeight - margin,
      font: boldFont,
      size: fontSize * 1.5,
      color: rgb(0, 0, 0),
    });
    
    // Add copyright if enabled
    if (includeCopyright && ipuzData.copyright) {
      const copyrightWidth = font.widthOfTextAtSize(ipuzData.copyright, fontSize * 0.8);
      
      gridPage.drawText(ipuzData.copyright, {
        x: (pageWidth - copyrightWidth) / 2,
        y: pageHeight - margin - fontSize * 2,
        font: font,
        size: fontSize * 0.8,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw grid
    if (ipuzData.puzzle) {
      const gridSize = ipuzData.puzzle.length;
      const cellSize = Math.min(400 / gridSize, 30); // Limit cell size
      const gridWidth = cellSize * gridSize;
      const gridHeight = cellSize * gridSize;
      const startX = (pageWidth - gridWidth) / 2;
      const startY = pageHeight - margin - fontSize * 4;
      
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const cell = ipuzData.puzzle[row][col];
          const x = startX + col * cellSize;
          const y = startY - row * cellSize;
          
          // Check if black cell
          if (cell === '#') {
            gridPage.drawRectangle({
              x,
              y: y - cellSize,
              width: cellSize,
              height: cellSize,
              color: rgb(0, 0, 0),
            });
          } else {
            // Draw white cell
            gridPage.drawRectangle({
              x,
              y: y - cellSize,
              width: cellSize,
              height: cellSize,
              color: rgb(1, 1, 1),
              borderColor: rgb(0, 0, 0),
              borderWidth: 1,
            });
            
            // Draw cell number if available
            let cellNumber = null;
            if (typeof cell === 'object' && cell.cell) {
              cellNumber = cell.cell;
            }
            
            if (cellNumber) {
              gridPage.drawText(cellNumber.toString(), {
                x: x + 2,
                y: y - 10,
                font: font,
                size: Math.max(8, cellSize / 4),
                color: rgb(0, 0, 0),
              });
            }
          }
        }
      }
    }
    
    // 2. Across clues page
    if (ipuzData.clues && ipuzData.clues.Across && ipuzData.clues.Across.length > 0) {
      const acrossPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;
      let currentColumn = 0;
      
      // Add title
      acrossPage.drawText(title, {
        x: (pageWidth - titleWidth) / 2,
        y,
        font: boldFont,
        size: fontSize * 1.5,
        color: rgb(0, 0, 0),
      });
      
      y -= fontSize * 3; // Extra space
      
      // Add "ACROSS" heading
      acrossPage.drawText("ACROSS", {
        x: margin + (currentColumn * (columnWidth + columnGap)),
        y,
        font: boldFont,
        size: fontSize * 1.2,
        color: rgb(0, 0, 0),
      });
      
      y -= fontSize * 2; // Space after heading
      
      // Add clues
      for (const clue of ipuzData.clues.Across) {
        // Check if we need a new column
        if (y < margin + lineHeight) {
          if (currentColumn < numColumns - 1) {
            currentColumn++;
            y = pageHeight - margin - fontSize * 3;
          } else {
            // New page
            acrossPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentColumn = 0;
            y = pageHeight - margin;
            
            // Add title again
            acrossPage.drawText(title, {
              x: (pageWidth - titleWidth) / 2,
              y,
              font: boldFont,
              size: fontSize * 1.5,
              color: rgb(0, 0, 0),
            });
            
            y -= fontSize * 3;
            
            // Add "ACROSS (continued)" heading
            acrossPage.drawText("ACROSS (continued)", {
              x: margin + (currentColumn * (columnWidth + columnGap)),
              y,
              font: boldFont,
              size: fontSize * 1.2,
              color: rgb(0, 0, 0),
            });
            
            y -= fontSize * 2;
          }
        }
        
        const clueNumber = clue[0];
        const clueText = clue[1];
        
        // Draw clue number
        acrossPage.drawText(`${clueNumber}`, {
          x: margin + (currentColumn * (columnWidth + columnGap)),
          y,
          font: boldFont,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
        
        // Calculate width for wrapping
        const numberWidth = boldFont.widthOfTextAtSize(`${clueNumber} `, fontSize);
        const indent = 20; // Indentation for wrapped lines
        const availableWidth = columnWidth - numberWidth;
        
        // Draw clue text with wrapping
        let remainingText = clueText;
        let firstLine = true;
        
        while (remainingText.length > 0) {
          // See how many characters fit on the line
          let lineText = '';
          let charIndex = 0;
          
          while (charIndex < remainingText.length) {
            const testLine = remainingText.substring(0, charIndex + 1);
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);
            
            if (testWidth > availableWidth) {
              // Find last space before overflow
              const lastSpace = testLine.lastIndexOf(' ');
              if (lastSpace !== -1) {
                lineText = remainingText.substring(0, lastSpace);
                remainingText = remainingText.substring(lastSpace + 1);
              } else {
                // No space, just cut it
                lineText = testLine;
                remainingText = remainingText.substring(charIndex + 1);
              }
              break;
            }
            
            charIndex++;
            
            // If we've reached the end, use the whole text
            if (charIndex === remainingText.length) {
              lineText = remainingText;
              remainingText = '';
              break;
            }
          }
          
          // Draw the current line
          acrossPage.drawText(lineText, {
            x: firstLine 
              ? margin + numberWidth + (currentColumn * (columnWidth + columnGap))
              : margin + indent + (currentColumn * (columnWidth + columnGap)),
            y,
            font: font,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          
          // Move down for the next line
          y -= lineHeight;
          firstLine = false;
          
          // Check if we need a new column
          if (remainingText.length > 0 && y < margin + lineHeight) {
            if (currentColumn < numColumns - 1) {
              currentColumn++;
              y = pageHeight - margin - fontSize * 3;
            } else {
              // New page
              acrossPage = pdfDoc.addPage([pageWidth, pageHeight]);
              currentColumn = 0;
              y = pageHeight - margin;
              
              // Add title again
              acrossPage.drawText(title, {
                x: (pageWidth - titleWidth) / 2,
                y,
                font: boldFont,
                size: fontSize * 1.5,
                color: rgb(0, 0, 0),
              });
              
              y -= fontSize * 3;
              
              // Add "ACROSS (continued)" heading
              acrossPage.drawText("ACROSS (continued)", {
                x: margin + (currentColumn * (columnWidth + columnGap)),
                y,
                font: boldFont,
                size: fontSize * 1.2,
                color: rgb(0, 0, 0),
              });
              
              y -= fontSize * 2;
            }
          }
        }
        
        // Space between clues
        y -= fontSize * 0.5;
      }
    }
    
    // 3. Down clues page
    if (ipuzData.clues && ipuzData.clues.Down && ipuzData.clues.Down.length > 0) {
      const downPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;
      let currentColumn = 0;
      
      // Add title
      downPage.drawText(title, {
        x: (pageWidth - titleWidth) / 2,
        y,
        font: boldFont,
        size: fontSize * 1.5,
        color: rgb(0, 0, 0),
      });
      
      y -= fontSize * 3; // Extra space
      
      // Add "DOWN" heading
      downPage.drawText("DOWN", {
        x: margin + (currentColumn * (columnWidth + columnGap)),
        y,
        font: boldFont,
        size: fontSize * 1.2,
        color: rgb(0, 0, 0),
      });
      
      y -= fontSize * 2; // Space after heading
      
      // Add clues (same logic as Across clues)
      for (const clue of ipuzData.clues.Down) {
        // Check if we need a new column
        if (y < margin + lineHeight) {
          if (currentColumn < numColumns - 1) {
            currentColumn++;
            y = pageHeight - margin - fontSize * 3;
          } else {
            // New page
            downPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentColumn = 0;
            y = pageHeight - margin;
            
            // Add title again
            downPage.drawText(title, {
              x: (pageWidth - titleWidth) / 2,
              y,
              font: boldFont,
              size: fontSize * 1.5,
              color: rgb(0, 0, 0),
            });
            
            y -= fontSize * 3;
            
            // Add "DOWN (continued)" heading
            downPage.drawText("DOWN (continued)", {
              x: margin + (currentColumn * (columnWidth + columnGap)),
              y,
              font: boldFont,
              size: fontSize * 1.2,
              color: rgb(0, 0, 0),
            });
            
            y -= fontSize * 2;
          }
        }
        
        const clueNumber = clue[0];
        const clueText = clue[1];
        
        // Draw clue number
        downPage.drawText(`${clueNumber}`, {
          x: margin + (currentColumn * (columnWidth + columnGap)),
          y,
          font: boldFont,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
        
        // Calculate width for wrapping
        const numberWidth = boldFont.widthOfTextAtSize(`${clueNumber} `, fontSize);
        const indent = 20; // Indentation for wrapped lines
        const availableWidth = columnWidth - numberWidth;
        
        // Draw clue text with wrapping
        let remainingText = clueText;
        let firstLine = true;
        
        while (remainingText.length > 0) {
          // See how many characters fit on the line
          let lineText = '';
          let charIndex = 0;
          
          while (charIndex < remainingText.length) {
            const testLine = remainingText.substring(0, charIndex + 1);
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);
            
            if (testWidth > availableWidth) {
              // Find last space before overflow
              const lastSpace = testLine.lastIndexOf(' ');
              if (lastSpace !== -1) {
                lineText = remainingText.substring(0, lastSpace);
                remainingText = remainingText.substring(lastSpace + 1);
              } else {
                // No space, just cut it
                lineText = testLine;
                remainingText = remainingText.substring(charIndex + 1);
              }
              break;
            }
            
            charIndex++;
            
            // If we've reached the end, use the whole text
            if (charIndex === remainingText.length) {
              lineText = remainingText;
              remainingText = '';
              break;
            }
          }
          
          // Draw the current line
          downPage.drawText(lineText, {
            x: firstLine 
              ? margin + numberWidth + (currentColumn * (columnWidth + columnGap))
              : margin + indent + (currentColumn * (columnWidth + columnGap)),
            y,
            font: font,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          
          // Move down for the next line
          y -= lineHeight;
          firstLine = false;
          
          // Check if we need a new column
          if (remainingText.length > 0 && y < margin + lineHeight) {
            if (currentColumn < numColumns - 1) {
              currentColumn++;
              y = pageHeight - margin - fontSize * 3;
            } else {
              // New page
              downPage = pdfDoc.addPage([pageWidth, pageHeight]);
              currentColumn = 0;
              y = pageHeight - margin;
              
              // Add title again
              downPage.drawText(title, {
                x: (pageWidth - titleWidth) / 2,
                y,
                font: boldFont,
                size: fontSize * 1.5,
                color: rgb(0, 0, 0),
              });
              
              y -= fontSize * 3;
              
              // Add "DOWN (continued)" heading
              downPage.drawText("DOWN (continued)", {
                x: margin + (currentColumn * (columnWidth + columnGap)),
                y,
                font: boldFont,
                size: fontSize * 1.2,
                color: rgb(0, 0, 0),
              });
              
              y -= fontSize * 2;
            }
          }
        }
        
        // Space between clues
        y -= fontSize * 0.5;
      }
    }
    
    // 4. Solution page (if requested)
    if (includeSolution && ipuzData.solution) {
      const solutionPage = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Add title
      solutionPage.drawText(title, {
        x: (pageWidth - titleWidth) / 2,
        y: pageHeight - margin,
        font: boldFont,
        size: fontSize * 1.5,
        color: rgb(0, 0, 0),
      });
      
      // Add "SOLUTION" heading
      const solutionText = "SOLUTION";
      const solutionWidth = boldFont.widthOfTextAtSize(solutionText, fontSize * 1.2);
      
      solutionPage.drawText(solutionText, {
        x: (pageWidth - solutionWidth) / 2,
        y: pageHeight - margin - fontSize * 3,
        font: boldFont,
        size: fontSize * 1.2,
        color: rgb(0, 0, 0),
      });
      
      // Draw solution grid
      if (ipuzData.solution) {
        const gridSize = ipuzData.solution.length;
        const cellSize = Math.min(400 / gridSize, 30); // Limit cell size
        const gridWidth = cellSize * gridSize;
        const gridHeight = cellSize * gridSize;
        const startX = (pageWidth - gridWidth) / 2;
        const startY = pageHeight - margin - fontSize * 5;
        
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            const cell = ipuzData.solution[row][col];
            const x = startX + col * cellSize;
            const y = startY - row * cellSize;
            
            // Check if black cell or has letter
            if (cell === '#') {
              solutionPage.drawRectangle({
                x,
                y: y - cellSize,
                width: cellSize,
                height: cellSize,
                color: rgb(0, 0, 0),
              });
            } else {
              // Draw white cell
              solutionPage.drawRectangle({
                x,
                y: y - cellSize,
                width: cellSize,
                height: cellSize,
                color: rgb(1, 1, 1),
                borderColor: rgb(0, 0, 0),
                borderWidth: 1,
              });
              
              // Draw letter if available
              if (typeof cell === 'string') {
                const letterWidth = boldFont.widthOfTextAtSize(cell, cellSize * 0.6);
                solutionPage.drawText(cell, {
                  x: x + (cellSize - letterWidth) / 2,
                  y: y - cellSize + (cellSize - cellSize * 0.6) / 2,
                  font: boldFont,
                  size: cellSize * 0.6,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }
      }
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputFile, pdfBytes);
    
    console.log(`Successfully converted to ${outputFile}`);
    return true;
  } catch (error) {
    console.error('Error converting to PDF:', error);
    return false;
  }
}

// Run the conversion
convertToPdf();