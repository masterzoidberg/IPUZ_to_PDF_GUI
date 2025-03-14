const { ipcRenderer } = require('electron');

// DOM elements
const selectFileBtn = document.getElementById('selectFileBtn');
const selectedFile = document.getElementById('selectedFile');
const openEditorBtn = document.getElementById('openEditorBtn');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const titleFontSize = document.getElementById('titleFontSize');
const sectionHeadingSize = document.getElementById('sectionHeadingSize');
const marginSize = document.getElementById('marginSize');
const customMargin = document.getElementById('customMargin');
const layoutStyle = document.getElementById('layoutStyle');
const clueColumns = document.getElementById('clueColumns');
const titleClueSpacing = document.getElementById('titleClueSpacing');
const lineSpacing = document.getElementById('lineSpacing');
const paperSize = document.getElementById('paperSize');
const includeCopyright = document.getElementById('includeCopyright');
const includeSolution = document.getElementById('includeSolution');
const convertBtn = document.getElementById('convertBtn');
const statusMessage = document.getElementById('statusMessage');
const puzzleDetails = document.getElementById('puzzleDetails');

// Store the selected file data
let currentFilePath = null;
let currentIpuzData = null;

// Show/hide custom margin input when 'custom' is selected
marginSize.addEventListener('change', function() {
  const customMarginDiv = document.querySelector('.margin-custom');
  if (this.value === 'custom') {
    customMarginDiv.style.display = 'flex';
  } else {
    customMarginDiv.style.display = 'none';
  }
});

// Event listeners
selectFileBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('open-file-dialog');
  
  if (result.error) {
    showStatus(`Error loading file: ${result.error}`, 'error');
    return;
  }
  
  if (!result.canceled && result.filePath) {
    currentFilePath = result.filePath;
    currentIpuzData = result.ipuzData;
    
    selectedFile.textContent = currentFilePath.split(/[\\/]/).pop();
    convertBtn.disabled = false;
    
    // Display puzzle info
    displayPuzzleInfo(currentIpuzData);
  }
});

// Handle font size changes to update column suggestion
fontSize.addEventListener('change', updateColumnSuggestion);

function updateColumnSuggestion() {
  if (clueColumns.value === 'auto') {
    // Just a visual feedback that auto will adjust based on font size
    const size = parseInt(fontSize.value, 10);
    let suggestion = '1';
    
    if (size <= 12) suggestion = '3-4';
    else if (size <= 14) suggestion = '2-3';
    else if (size <= 18) suggestion = '1-2';
    else suggestion = '1';
    
    clueColumns.title = `Auto will choose approximately ${suggestion} columns based on current font size`;
  }
}

convertBtn.addEventListener('click', async () => {
  if (!currentFilePath || !currentIpuzData) {
    showStatus('Please select an IPUZ file first', 'error');
    return;
  }
  
  // Get the save location
  const defaultOutputPath = currentFilePath.replace(/\.ipuz$/i, '') + '.pdf';
  const outputPath = await ipcRenderer.invoke('save-file-dialog', defaultOutputPath);
  
  if (!outputPath) {
    // User canceled the save dialog
    return;
  }
  
  // Calculate margin value based on selection
  let marginValue;
  if (marginSize.value === 'custom') {
    marginValue = parseInt(customMargin.value, 10);
  } else if (marginSize.value === 'small') {
    marginValue = 24;
  } else if (marginSize.value === 'medium') {
    marginValue = 36;
  } else { // large
    marginValue = 54;
  }
  
  // Show processing status
  showStatus('Converting puzzle to PDF...', '');
  
  // Convert the file
  const result = await ipcRenderer.invoke('convert-ipuz-to-pdf', {
    ipuzData: currentIpuzData,
    outputPath,
    fontFamily: fontFamily.value,
    fontSize: parseInt(fontSize.value, 10),
    titleFontSize: parseInt(titleFontSize.value, 10),
    sectionHeadingSize: parseInt(sectionHeadingSize.value, 10),
    margin: marginValue,
    layoutStyle: layoutStyle.value,
    clueColumns: clueColumns.value,
    titleClueSpacing: titleClueSpacing.value,
    lineSpacing: parseFloat(lineSpacing.value),
    paperSize: paperSize.value,
    includeCopyright: includeCopyright.checked,
    includeSolution: includeSolution.checked
  });
  
  if (result.error) {
    showStatus(`Error creating PDF: ${result.error}`, 'error');
  } else {
    showStatus(`PDF created successfully: ${outputPath}`, 'success');
  }
});

// Helper functions
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status';
  
  if (type) {
    statusMessage.classList.add(type);
  }
}

// Open visual editor
if (openEditorBtn) {
  openEditorBtn.addEventListener('click', () => {
    window.location.href = 'editor.html';
  });
}

function displayPuzzleInfo(ipuzData) {
  let infoHTML = '';
  
  if (ipuzData.title) {
    infoHTML += `<p><strong>Title:</strong> ${ipuzData.title}</p>`;
  }
  
  if (ipuzData.author) {
    infoHTML += `<p><strong>Author:</strong> ${ipuzData.author || 'Not specified'}</p>`;
  }
  
  if (ipuzData.copyright) {
    infoHTML += `<p><strong>Copyright:</strong> ${ipuzData.copyright}</p>`;
  }
  
  if (ipuzData.puzzle) {
    const gridSize = ipuzData.puzzle.length;
    infoHTML += `<p><strong>Grid Size:</strong> ${gridSize}×${gridSize}</p>`;
  }
  
  let acrossCount = 0;
  let downCount = 0;
  
  if (ipuzData.clues) {
    if (ipuzData.clues.Across) {
      acrossCount = ipuzData.clues.Across.length;
      infoHTML += `<p><strong>Across Clues:</strong> ${acrossCount}</p>`;
    }
    if (ipuzData.clues.Down) {
      downCount = ipuzData.clues.Down.length;
      infoHTML += `<p><strong>Down Clues:</strong> ${downCount}</p>`;
    }
    infoHTML += `<p><strong>Total Clues:</strong> ${acrossCount + downCount}</p>`;
  }
  
  // Suggest an optimal layout
  updateColumnSuggestion();
  
  puzzleDetails.innerHTML = infoHTML || 'No puzzle details available';
}
