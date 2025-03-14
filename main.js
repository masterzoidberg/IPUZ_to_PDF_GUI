const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  
  // Check for command line args indicating which window to open
  if (process.argv.includes('--editor')) {
    mainWindow.loadFile('editor.html');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Normalize IPUZ data to handle different formats
function normalizeIpuzData(ipuzData) {
  console.log("Normalizing IPUZ data...");
  
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
    // Create a normalized puzzle grid
    normalized.puzzle = ipuzData.puzzle.map(row => {
      return row.map(cell => {
        // Handle different cell formats
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
        // Format 1: [[number, text], [number, text]]
        ipuzData.clues.Down.map(clue => {
          if (Array.isArray(clue)) {
            return [clue[0], clue[1]];
          } else if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean) :
        // Format 2: [{number, clue}, {number, clue}]
        Object.values(ipuzData.clues.Down).map(clue => {
          if (typeof clue === 'object' && clue.number && clue.clue) {
            return [clue.number, clue.clue];
          }
          return null;
        }).filter(Boolean);
    }
  }
  
  // Log some debug info
  console.log(`Normalized data: Found ${normalized.puzzle.length}x${normalized.puzzle[0].length} grid`);
  console.log(`Found ${normalized.clues.Across.length} Across clues and ${normalized.clues.Down.length} Down clues`);
  
  return normalized;
}

// IPC handlers
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'IPUZ Files', extensions: ['ipuz'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const ipuzData = normalizeIpuzData(JSON.parse(fileContent));
      
      return {
        filePath,
        ipuzData
      };
    } catch (error) {
      return { error: error.message };
    }
  }
  
  return { canceled: true };
});

ipcMain.handle('save-file-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });
  
  if (!result.canceled) {
    return result.filePath;
  }
  
  return null;
});

ipcMain.handle('convert-ipuz-to-pdf-visual', async (event, params) => {
  try {
    const { ipuzData, outputPath, layoutSettings } = params;
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Set page dimensions based on paper size
    let pageWidth, pageHeight;
    const paperSize = layoutSettings.paperSize || 'letter';
    
    if (paperSize === 'letter') {
      pageWidth = 8.5 * 72; // 8.5 inches in points
      pageHeight = 11 * 72; // 11 inches in points
    } else if (paperSize === 'legal') {
      pageWidth = 8.5 * 72; // 8.5 inches in points
      pageHeight = 14 * 72; // 14 inches in points
    } else { // A4
      pageWidth = 595.28; // A4 width in points
      pageHeight = 841.89; // A4 height in points
    }
    
    // Add page
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    
    // Draw title if present in layout
    if (layoutSettings.title) {
      const titleText = ipuzData.title || 'Crossword Puzzle';
      const titleX = layoutSettings.title.left;
      const titleY = pageHeight - layoutSettings.title.top;
      const titleFontSize = layoutSettings.title.fontSize || 24;
      
      page.drawText(titleText, {
        x: titleX,
        y: titleY,
        font: boldFont,
        size: titleFontSize,
        color: rgb(0, 0, 0),
      });
      
      // Add copyright if available
      if (ipuzData.copyright) {
        page.drawText(ipuzData.copyright, {
          x: titleX,
          y: titleY - titleFontSize * 1.5,
          font: font,
          size: titleFontSize * 0.6,
          color: rgb(0, 0, 0),
        });
      }
    }
    
    // Draw grid if present in layout and in the data
    if (layoutSettings.grid && ipuzData.puzzle) {
      const gridSize = ipuzData.puzzle.length;
      const cellSize = layoutSettings.grid.cellSize || 30;
      const gridX = layoutSettings.grid.left;
      const gridY = pageHeight - layoutSettings.grid.top;
      
      // Draw the grid
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const cell = ipuzData.puzzle[row][col];
          const x = gridX + col * cellSize;
          const y = gridY - row * cellSize;
          
          // Check if it's a black cell
          const isBlackCell = cell === '#' || (typeof cell === 'number' && cell === 0) || cell === null;
          
          if (isBlackCell) {
            // Draw black cell
            page.drawRectangle({
              x,
              y: y - cellSize,
              width: cellSize,
              height: cellSize,
              color: rgb(0, 0, 0),
            });
          } else {
            // Draw white cell with border
            page.drawRectangle({
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
            } else if (typeof cell === 'object' && cell.number) {
              cellNumber = cell.number;
            }
            
            if (cellNumber && cellNumber > 0) {
              page.drawText(cellNumber.toString(), {
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
    
    // Draw Across clues if present in layout
    if (layoutSettings.acrossClues && ipuzData.clues && ipuzData.clues.Across) {
      const cluesX = layoutSettings.acrossClues.left;
      const cluesY = pageHeight - layoutSettings.acrossClues.top;
      const cluesWidth = layoutSettings.acrossClues.width || 200;
      const fontSize = 14;
      const headerFontSize = 18;
      
      // Draw header
      page.drawText("ACROSS", {
        x: cluesX,
        y: cluesY,
        font: boldFont,
        size: headerFontSize,
        color: rgb(0, 0, 0),
      });
      
      // Draw clues
      let y = cluesY - headerFontSize - 10;
      for (const clue of ipuzData.clues.Across) {
        if (Array.isArray(clue) && clue.length >= 2) {
          const clueNumber = clue[0];
          const clueText = clue[1];
          
          // Format the clue number in bold
          const clueNumberText = `${clueNumber}.`;
          const clueNumberWidth = boldFont.widthOfTextAtSize(clueNumberText, fontSize);
          
          page.drawText(clueNumberText, {
            x: cluesX,
            y,
            font: boldFont,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          
          // Simple text wrapping for clue text
          const indent = clueNumberWidth + 5;
          const maxWidth = cluesWidth - indent;
          const words = clueText.split(' ');
          let line = '';
          let xPos = cluesX + indent;
          
          for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);
            
            if (textWidth > maxWidth && line) {
              page.drawText(line, {
                x: xPos,
                y,
                font: font,
                size: fontSize,
                color: rgb(0, 0, 0),
              });
              y -= fontSize * 1.3;
              line = word;
              xPos = cluesX + indent;
            } else {
              line = testLine;
            }
          }
          
          if (line) {
            page.drawText(line, {
              x: xPos,
              y,
              font: font,
              size: fontSize,
              color: rgb(0, 0, 0),
            });
          }
          
          y -= fontSize * 1.5;
        }
      }
    }
    
    // Draw Down clues if present in layout
    if (layoutSettings.downClues && ipuzData.clues && ipuzData.clues.Down) {
      const cluesX = layoutSettings.downClues.left;
      const cluesY = pageHeight - layoutSettings.downClues.top;
      const cluesWidth = layoutSettings.downClues.width || 200;
      const fontSize = 14;
      const headerFontSize = 18;
      
      // Draw header
      page.drawText("DOWN", {
        x: cluesX,
        y: cluesY,
        font: boldFont,
        size: headerFontSize,
        color: rgb(0, 0, 0),
      });
      
      // Draw clues
      let y = cluesY - headerFontSize - 10;
      for (const clue of ipuzData.clues.Down) {
        if (Array.isArray(clue) && clue.length >= 2) {
          const clueNumber = clue[0];
          const clueText = clue[1];
          
          // Format the clue number in bold
          const clueNumberText = `${clueNumber}.`;
          const clueNumberWidth = boldFont.widthOfTextAtSize(clueNumberText, fontSize);
          
          page.drawText(clueNumberText, {
            x: cluesX,
            y,
            font: boldFont,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          
          // Simple text wrapping for clue text
          const indent = clueNumberWidth + 5;
          const maxWidth = cluesWidth - indent;
          const words = clueText.split(' ');
          let line = '';
          let xPos = cluesX + indent;
          
          for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);
            
            if (textWidth > maxWidth && line) {
              page.drawText(line, {
                x: xPos,
                y,
                font: font,
                size: fontSize,
                color: rgb(0, 0, 0),
              });
              y -= fontSize * 1.3;
              line = word;
              xPos = cluesX + indent;
            } else {
              line = testLine;
            }
          }
          
          if (line) {
            page.drawText(line, {
              x: xPos,
              y,
              font: font,
              size: fontSize,
              color: rgb(0, 0, 0),
            });
          }
          
          y -= fontSize * 1.5;
        }
      }
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    
    return { success: true };
  } catch (error) {
    console.error('Visual PDF generation error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('convert-ipuz-to-pdf', async (event, params) => {
  try {
    const { 
      ipuzData, 
      outputPath, 
      fontFamily,
      fontSize, 
      titleFontSize, 
      sectionHeadingSize,
      margin,
      layoutStyle, 
      clueColumns,
      titleClueSpacing,
      lineSpacing,
      paperSize,
      includeCopyright,
      includeSolution
    } = params;
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Select font family
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
    
    // Set page dimensions based on paper size
    let pageWidth, pageHeight;
    
    if (paperSize === 'letter') {
      pageWidth = 8.5 * 72; // 8.5 inches in points
      pageHeight = 11 * 72; // 11 inches in points
    } else if (paperSize === 'legal') {
      pageWidth = 8.5 * 72; // 8.5 inches in points
      pageHeight = 14 * 72; // 14 inches in points
    } else { // A4
      pageWidth = 595.28; // A4 width in points
      pageHeight = 841.89; // A4 height in points
    }
    
    // Calculate spacing
    const pageMargin = margin; // Use the provided margin value
    const lineHeight = fontSize * lineSpacing;
    
    // Get title-clue spacing
    let titleClueGap;
    if (titleClueSpacing === 'normal') {
      titleClueGap = lineHeight * 1.5;
    } else if (titleClueSpacing === 'large') {
      titleClueGap = lineHeight * 2.5;
    } else { // extra-large
      titleClueGap = lineHeight * 3.5;
    }
    
    // Determine if we should include grid and/or clues
    const includeGrid = layoutStyle !== 'clues-only';
    const includeClues = layoutStyle !== 'grid-only';
    
    // Determine optimal number of columns based on font size if auto selected
    let numColumns = 1;
    if (clueColumns === 'auto') {
      // Formula to determine optimal column count based on font size
      if (fontSize <= 12) numColumns = 3; // Small font = more columns
      else if (fontSize <= 14) numColumns = 2; // Medium font = 2 columns
      else numColumns = 1; // Large font = 1 column
      
      // Adjust based on paper size and width availability
      if (fontSize <= 12 && paperSize === 'legal') numColumns = 4; // Legal paper can fit more columns
      
      console.log(`Auto-detected optimal column count: ${numColumns} for font size ${fontSize}`);
    } else {
      numColumns = parseInt(clueColumns, 10);
    }
    
    // Calculate column width and gap
    const columnGap = pageMargin * 0.6;
    const columnWidth = (pageWidth - (2 * pageMargin) - ((numColumns - 1) * columnGap)) / numColumns;
    
    let currentPage, currentColumn = 0;
    
    // Function to add a new page
    const addNewPage = () => {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentColumn = 0;
      return pageHeight - pageMargin;
    };
    
    // Function to add title to page
    const addTitle = (page, yPosition) => {
      const title = ipuzData.title || 'Crossword Puzzle';
      const titleWidth = boldFont.widthOfTextAtSize(title, titleFontSize);
      
      page.drawText(title, {
        x: (pageWidth - titleWidth) / 2,
        y: yPosition,
        font: boldFont,
        size: titleFontSize,
        color: rgb(0, 0, 0),
      });
      
      let newY = yPosition - titleFontSize * 1.5;
      
      // Add copyright if available and requested
      if (includeCopyright && ipuzData.copyright) {
        const copyrightWidth = font.widthOfTextAtSize(ipuzData.copyright, fontSize * 0.8);
        
        page.drawText(ipuzData.copyright, {
          x: (pageWidth - copyrightWidth) / 2,
          y: newY,
          font: font,
          size: fontSize * 0.8,
          color: rgb(0, 0, 0),
        });
        newY -= lineHeight;
      }
      
      return newY;
    };
    
    // Function to draw the grid
    const drawGrid = (page, yPosition, isBlankSolution = false) => {
      if (!ipuzData.puzzle) return yPosition;
      
      const gridSize = ipuzData.puzzle.length;
      const maxGridWidth = Math.min(pageWidth - (2 * pageMargin), pageHeight - (2 * pageMargin) - titleFontSize * 3);
      const cellSize = Math.min(maxGridWidth / gridSize, 30); // Limit cell size
      const gridWidth = cellSize * gridSize;
      const gridHeight = cellSize * gridSize;
      const startX = (pageWidth - gridWidth) / 2;
      const startY = yPosition;
      
      // Draw the grid
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const cell = ipuzData.puzzle[row][col];
          const x = startX + col * cellSize;
          const y = startY - row * cellSize;
          
          // Check if it's a black cell
          const isBlackCell = cell === '#' || (typeof cell === 'number' && cell === 0) || cell === null;
          
          if (isBlackCell) {
            // Draw black cell
            page.drawRectangle({
              x,
              y: y - cellSize,
              width: cellSize,
              height: cellSize,
              color: rgb(0, 0, 0),
            });
          } else {
            // Draw white cell with border
            page.drawRectangle({
              x,
              y: y - cellSize,
              width: cellSize,
              height: cellSize,
              color: rgb(1, 1, 1),
              borderColor: rgb(0, 0, 0),
              borderWidth: 1,
            });
            
            // If this is the solution grid and we have a solution, draw the letter
            if (isBlankSolution && ipuzData.solution && ipuzData.solution[row] && ipuzData.solution[row][col]) {
              const letter = ipuzData.solution[row][col];
              if (typeof letter === 'string') {
                const letterWidth = font.widthOfTextAtSize(letter, Math.max(12, cellSize * 0.6));
                page.drawText(letter, {
                  x: x + (cellSize - letterWidth) / 2,
                  y: y - cellSize + (cellSize - Math.max(12, cellSize * 0.6)) / 2,
                  font: boldFont,
                  size: Math.max(12, cellSize * 0.6),
                  color: rgb(0, 0, 0),
                });
              }
            }
            
            // Draw cell number if available (handle different IPUZ formats)
            if (!isBlankSolution) {
              let cellNumber = null;
              if (typeof cell === 'object' && cell.cell) {
                cellNumber = cell.cell;
              } else if (typeof cell === 'object' && cell.number) {
                cellNumber = cell.number;
              }
              
              if (cellNumber) {
                page.drawText(cellNumber.toString(), {
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
      
      // Return position after grid
      return startY - gridHeight - lineHeight;
    };
    
    // Function to check if we need to start a new column or page
    const checkPosition = () => {
      if (y < pageMargin + lineHeight) {
        if (numColumns > 1 && currentColumn < numColumns - 1) {
          // Move to next column
          currentColumn++;
          y = pageHeight - pageMargin - titleFontSize * 2; // Leave space for title
        } else {
          // Move to next page
          y = addNewPage();
          y = addTitle(currentPage, y); // Add title to new page
          y -= lineHeight * 2;
        }
      }
      return y;
    };
    
    // Function to calculate x position based on current column
    const getXPosition = (colOffset = 0) => {
      return pageMargin + (currentColumn + colOffset) * (columnWidth + columnGap);
    };
    
    // Process clues
    const processClues = (clueList, sectionTitle, startOnNewPage = false) => {
      // More robust error checking
      if (!clueList) {
        console.log(`No clues found for section: ${sectionTitle}`);
        return y;
      }
      
      // Make sure clueList is an array
      if (!Array.isArray(clueList) || clueList.length === 0) {
        console.log(`Empty clue list or invalid format for section: ${sectionTitle}`);
        return y;
      }
      
      if (startOnNewPage) {
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
      }
      
      // Add section title
      y = checkPosition();
      
      // Add section title with extra space below
      currentPage.drawText(sectionTitle, {
        x: getXPosition(),
        y,
        font: boldFont,
        size: sectionHeadingSize,
        color: rgb(0, 0, 0),
      });
      
      // Add extra space after section title
      y -= titleClueGap; // Increased space after section title
      
      // Add clues
      for (const clue of clueList) {
        // Additional validation to make sure the clue is properly formatted
        if (!Array.isArray(clue) || clue.length < 2) {
          console.log(`Invalid clue format: ${JSON.stringify(clue)}`);
          continue; // Skip this clue and move to the next
        }
        
        const clueNumber = clue[0];
        const clueText = clue[1];
        
        // Check position
        y = checkPosition();
        
        // Format the clue number in bold
        const clueNumberText = `${clueNumber}`;
        const clueNumberWidth = boldFont.widthOfTextAtSize(clueNumberText, fontSize);
        
        currentPage.drawText(clueNumberText, {
          x: getXPosition(),
          y,
          font: boldFont,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
        
        // Wrap and draw clue text
        const indent = clueNumberWidth + 10;
        const maxLineWidth = columnWidth - indent;
        let remainingText = clueText;
        let firstLine = true;
        
        while (remainingText.length > 0) {
          // Find how much text will fit on this line
          let lineText = '';
          let testText = '';
          const words = remainingText.split(' ');
          
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testWithWord = testText + (testText ? ' ' : '') + word;
            
            if (font.widthOfTextAtSize(testWithWord, fontSize) <= maxLineWidth) {
              testText = testWithWord;
              if (i === words.length - 1) {
                lineText = testText;
                remainingText = '';
              }
            } else {
              if (testText === '') {
                // Single word is too long, need to truncate
                lineText = word;
                remainingText = words.slice(i + 1).join(' ');
              } else {
                lineText = testText;
                remainingText = words.slice(i).join(' ');
              }
              break;
            }
          }
          
          // Draw the line
          currentPage.drawText(lineText, {
            x: getXPosition() + (firstLine ? clueNumberWidth + 10 : indent),
            y,
            font: font,
            size: fontSize,
            color: rgb(0, 0, 0),
          });
          
          // Move down for next line
          y -= lineHeight;
          firstLine = false;
          
          // Check if we need a new column/page
          if (remainingText.length > 0) {
            y = checkPosition();
          }
        }
        
        // Add some space between clues
        y -= lineHeight * 0.3;
        y = checkPosition();
      }
      
      // Return the current y position
      return y;
    };
    
    // IMPLEMENTATION OF DIFFERENT LAYOUT STYLES
    
    // Variable to track current y position on page
    let y;
    
    // Book style layout (Grid, Across, Down on separate pages)
    if (layoutStyle === 'book-style') {
      if (includeGrid) {
        // First page: Grid
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
        drawGrid(currentPage, y);
      }
      
      if (includeClues && ipuzData.clues) {
        // Second page: Across clues
        if (ipuzData.clues.Across && ipuzData.clues.Across.length > 0) {
          y = addNewPage();
          y = addTitle(currentPage, y);
          y -= lineHeight * 2;
          processClues(ipuzData.clues.Across, "ACROSS");
        }
        
        // Third page: Down clues
        if (ipuzData.clues.Down && ipuzData.clues.Down.length > 0) {
          y = addNewPage();
          y = addTitle(currentPage, y);
          y -= lineHeight * 2;
          processClues(ipuzData.clues.Down, "DOWN");
        }
      }
    }
    // Grid first, then all clues
    else if (layoutStyle === 'grid-first') {
      if (includeGrid) {
        // First page: Grid
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
        drawGrid(currentPage, y);
      }
      
      if (includeClues && ipuzData.clues) {
        // Next page(s): All clues
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
        
        if (ipuzData.clues.Across && ipuzData.clues.Across.length > 0) {
          y = processClues(ipuzData.clues.Across, "ACROSS");
          y -= lineHeight * 2; // Extra space between sections
        }
        
        if (ipuzData.clues.Down && ipuzData.clues.Down.length > 0) {
          y = processClues(ipuzData.clues.Down, "DOWN");
        }
      }
    }
    // Clues first, then grid
    else if (layoutStyle === 'clues-first') {
      if (includeClues && ipuzData.clues) {
        // Start with clues
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
        
        if (ipuzData.clues.Across && ipuzData.clues.Across.length > 0) {
          y = processClues(ipuzData.clues.Across, "ACROSS");
          y -= lineHeight * 2; // Extra space between sections
        }
        
        if (ipuzData.clues.Down && ipuzData.clues.Down.length > 0) {
          y = processClues(ipuzData.clues.Down, "DOWN");
        }
      }
      
      if (includeGrid) {
        // Last page: Grid
        y = addNewPage();
        y = addTitle(currentPage, y);
        y -= lineHeight * 2;
        drawGrid(currentPage, y);
      }
    }
    // Grid only
    else if (layoutStyle === 'grid-only') {
      y = addNewPage();
      y = addTitle(currentPage, y);
      y -= lineHeight * 2;
      drawGrid(currentPage, y);
    }
    // Clues only
    else if (layoutStyle === 'clues-only') {
      y = addNewPage();
      y = addTitle(currentPage, y);
      y -= lineHeight * 2;
      
      if (ipuzData.clues) {
        if (ipuzData.clues.Across && ipuzData.clues.Across.length > 0) {
          y = processClues(ipuzData.clues.Across, "ACROSS");
          y -= lineHeight * 2; // Extra space between sections
        }
        
        if (ipuzData.clues.Down && ipuzData.clues.Down.length > 0) {
          y = processClues(ipuzData.clues.Down, "DOWN");
        }
      }
    }
    
    // Add solution grid if requested
    if (includeSolution && ipuzData.solution) {
      y = addNewPage();
      y = addTitle(currentPage, y);
      y -= lineHeight;
      
      // Add "Solution" text
      const solutionText = "SOLUTION";
      const solutionWidth = boldFont.widthOfTextAtSize(solutionText, fontSize * 1.2);
      
      currentPage.drawText(solutionText, {
        x: (pageWidth - solutionWidth) / 2,
        y,
        font: boldFont,
        size: fontSize * 1.2,
        color: rgb(0, 0, 0),
      });
      
      y -= lineHeight * 2;
      drawGrid(currentPage, y, true); // Draw solution grid with letters
    }
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    
    return { success: true };
  } catch (error) {
    console.error('PDF generation error:', error);
    return { error: error.message };
  }
});
