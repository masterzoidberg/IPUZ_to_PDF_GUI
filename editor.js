const { ipcRenderer } = require('electron');
const fabric = require('fabric').fabric;

// References to DOM elements
let editorCanvas;
let currentFilePath = null;
let currentIpuzData = null;
let fabricCanvas;

// Canvas settings
const PAGE_PADDING = 20;
const GRID_CELL_SIZE = 30;
const EDITOR_WIDTH = 800;
const EDITOR_HEIGHT = 1000;

// Multi-page support
let pages = []; // Array to store page objects
let currentPageIndex = 0;

// Element references for draggable components
let puzzleGrid;
let titleText;
let acrossCluesGroup;
let downCluesGroup;

// Zoom settings
let currentZoom = 1.0;
const ZOOM_INCREMENT = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

// Initialize editor when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeEditor();
    setupEventListeners();
    createFirstPage(); // Initialize with a blank page
});

function initializeEditor() {
    // Initialize Fabric.js canvas
    editorCanvas = document.getElementById('editorCanvas');
    
    if (!editorCanvas) {
        console.error('Canvas element not found');
        return;
    }
    
    fabricCanvas = new fabric.Canvas('editorCanvas', {
        width: EDITOR_WIDTH,
        height: EDITOR_HEIGHT,
        backgroundColor: '#f0f0f0',
        selection: true
    });
    
    // Add page representation
    addPageBoundary();
    
    // Add rulers/guides
    addRulers();
    
    // Enable object controls
    setupObjectControls();
}

function createFirstPage() {
    addNewPage();
    updatePageNavigation();
}

function setupEventListeners() {
    // Import puzzle button
    const importPuzzleBtn = document.getElementById('importPuzzleBtn');
    if (importPuzzleBtn) {
        importPuzzleBtn.addEventListener('click', importPuzzle);
    }
    
    // Generate PDF button
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', generatePdf);
    }
    
    // Return to settings button
    const returnToSettingsBtn = document.getElementById('returnToSettings');
    if (returnToSettingsBtn) {
        returnToSettingsBtn.addEventListener('click', returnToSettings);
    }
    
    // Add controls for paper size
    const paperSizeSelect = document.getElementById('editorPaperSize');
    if (paperSizeSelect) {
        paperSizeSelect.addEventListener('change', updatePageBoundary);
    }
    
    // Add event listener for toggle grid snap
    const toggleGridSnapBtn = document.getElementById('toggleGridSnap');
    if (toggleGridSnapBtn) {
        toggleGridSnapBtn.addEventListener('click', toggleGridSnap);
    }
    
    // Zoom controls
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    
    // Add custom text button
    const addCustomTextBtn = document.getElementById('addCustomTextBtn');
    if (addCustomTextBtn) {
        addCustomTextBtn.addEventListener('click', addCustomText);
    }
    
    // Page navigation
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const addPageBtn = document.getElementById('addPage');
    
    if (prevPageBtn) prevPageBtn.addEventListener('click', goToPrevPage);
    if (nextPageBtn) nextPageBtn.addEventListener('click', goToNextPage);
    if (addPageBtn) addPageBtn.addEventListener('click', addNewPage);
    
    // Clone and delete buttons
    const cloneElementBtn = document.getElementById('cloneElementBtn');
    const deleteElementBtn = document.getElementById('deleteElementBtn');
    
    if (cloneElementBtn) cloneElementBtn.addEventListener('click', cloneSelectedElement);
    if (deleteElementBtn) deleteElementBtn.addEventListener('click', deleteSelectedElement);
}

// Page management functions
function addNewPage() {
    // Save current page if it exists
    if (fabricCanvas && pages.length > 0) {
        saveCurrentPage();
    }
    
    // Create a new page
    pages.push({
        objects: [],
        paperSize: document.getElementById('editorPaperSize')?.value || 'letter'
    });
    
    // Switch to the new page
    currentPageIndex = pages.length - 1;
    loadPage(currentPageIndex);
    updatePageNavigation();
    
    showStatus(`Added page ${pages.length}`, 'success');
}

function saveCurrentPage() {
    if (currentPageIndex >= 0 && currentPageIndex < pages.length) {
        // Save all canvas objects except for page boundary and grid lines
        const pageObjects = fabricCanvas.getObjects().filter(obj => {
            return !(obj.id === 'pageBoundary' || (obj.id && obj.id.startsWith('gridLine')));
        });
        
        // Convert objects to fabric.js JSON format
        pages[currentPageIndex].objects = pageObjects.map(obj => obj.toJSON(['id', 'selectable', 'hasControls']));
        pages[currentPageIndex].paperSize = document.getElementById('editorPaperSize')?.value || 'letter';
    }
}

function loadPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    
    // Clear current canvas except for page boundary
    fabricCanvas.getObjects().forEach(obj => {
        if (obj.id !== 'pageBoundary') {
            fabricCanvas.remove(obj);
        }
    });
    
    // Set paper size from saved page
    if (pages[pageIndex].paperSize) {
        const paperSizeSelect = document.getElementById('editorPaperSize');
        if (paperSizeSelect) {
            paperSizeSelect.value = pages[pageIndex].paperSize;
        }
    }
    
    // Update page boundary with the correct paper size
    addPageBoundary();
    
    // Add rulers/guides
    addRulers();
    
    // Load saved objects
    if (pages[pageIndex].objects && pages[pageIndex].objects.length > 0) {
        fabric.util.enlivenObjects(pages[pageIndex].objects, function(enlivenedObjects) {
            enlivenedObjects.forEach(obj => {
                fabricCanvas.add(obj);
            });
            fabricCanvas.renderAll();
        });
    } else {
        // If this is an empty page, add placeholder elements
        addPlaceholderElements();
    }
    
    updatePageNavigation();
}

function goToPrevPage() {
    if (currentPageIndex > 0) {
        saveCurrentPage();
        currentPageIndex--;
        loadPage(currentPageIndex);
    }
}

function goToNextPage() {
    if (currentPageIndex < pages.length - 1) {
        saveCurrentPage();
        currentPageIndex++;
        loadPage(currentPageIndex);
    }
}

function updatePageNavigation() {
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    if (prevPageBtn) prevPageBtn.disabled = currentPageIndex === 0;
    if (nextPageBtn) nextPageBtn.disabled = currentPageIndex === pages.length - 1;
    if (pageInfo) pageInfo.textContent = `Page ${currentPageIndex + 1} of ${pages.length}`;
}

// Draw page boundary based on selected paper size
function addPageBoundary() {
    const paperSize = document.getElementById('editorPaperSize')?.value || 'letter';
    let pageWidth, pageHeight;
    
    if (paperSize === 'letter') {
        pageWidth = 8.5 * 72; // 8.5 inches in points
        pageHeight = 11 * 72; // 11 inches in points
    } else if (paperSize === 'legal') {
        pageWidth = 8.5 * 72;
        pageHeight = 14 * 72; 
    } else { // A4
        pageWidth = 595.28; // A4 width in points
        pageHeight = 841.89; // A4 height in points
    }
    
    // Scale down to fit within editor
    const scale = Math.min(
        (EDITOR_WIDTH - 2 * PAGE_PADDING) / pageWidth,
        (EDITOR_HEIGHT - 2 * PAGE_PADDING) / pageHeight
    );
    
    const scaledWidth = pageWidth * scale;
    const scaledHeight = pageHeight * scale;
    
    // Create or update page boundary rectangle
    if (fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary')) {
        const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
        pageBoundary.set({
            width: scaledWidth,
            height: scaledHeight,
            left: (EDITOR_WIDTH - scaledWidth) / 2,
            top: (EDITOR_HEIGHT - scaledHeight) / 2
        });
    } else {
        const pageBoundary = new fabric.Rect({
            width: scaledWidth,
            height: scaledHeight,
            left: (EDITOR_WIDTH - scaledWidth) / 2,
            top: (EDITOR_HEIGHT - scaledHeight) / 2,
            fill: 'white',
            stroke: '#aaaaaa',
            strokeWidth: 1,
            selectable: false,
            id: 'pageBoundary'
        });
        fabricCanvas.add(pageBoundary);
        pageBoundary.sendToBack();
    }
    
    fabricCanvas.renderAll();
    
    // Store page info for coordinate transformations
    fabricCanvas.pageInfo = {
        width: pageWidth,
        height: pageHeight,
        scaledWidth: scaledWidth,
        scaledHeight: scaledHeight,
        scale: scale
    };
}

function updatePageBoundary() {
    addPageBoundary();
    // Reposition elements to fit new page
    repositionElements();
}

function addRulers() {
    // Add a grid with lines every 0.5 inch
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    const pageLeft = pageBoundary.left;
    const pageTop = pageBoundary.top;
    const pageWidth = pageBoundary.width;
    const pageHeight = pageBoundary.height;
    
    // Remove existing grid lines
    fabricCanvas.getObjects().filter(obj => obj.id && obj.id.startsWith('gridLine')).forEach(obj => {
        fabricCanvas.remove(obj);
    });
    
    // Add horizontal grid lines
    const gridSpacing = GRID_CELL_SIZE;
    for (let y = pageTop; y <= pageTop + pageHeight; y += gridSpacing) {
        const line = new fabric.Line([pageLeft, y, pageLeft + pageWidth, y], {
            stroke: '#e0e0e0',
            selectable: false,
            id: `gridLine-h-${y}`
        });
        fabricCanvas.add(line);
        line.sendToBack();
    }
    
    // Add vertical grid lines
    for (let x = pageLeft; x <= pageLeft + pageWidth; x += gridSpacing) {
        const line = new fabric.Line([x, pageTop, x, pageTop + pageHeight], {
            stroke: '#e0e0e0',
            selectable: false,
            id: `gridLine-v-${x}`
        });
        fabricCanvas.add(line);
        line.sendToBack();
    }
    
    pageBoundary.bringForward();
    fabricCanvas.renderAll();
}

function addPlaceholderElements() {
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    const pageLeft = pageBoundary.left;
    const pageTop = pageBoundary.top;
    const pageWidth = pageBoundary.width;
    
    // Add title placeholder
    titleText = new fabric.Textbox('Page ' + (currentPageIndex + 1), {
        left: pageLeft + pageWidth/2,
        top: pageTop + 40,
        originX: 'center',
        width: pageWidth * 0.8,
        fontSize: 24,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#333333',
        id: 'titleText',
        editable: true
    });
    fabricCanvas.add(titleText);
    
    fabricCanvas.renderAll();
}

function createEmptyGrid(size, cellSize) {
    const gridWidth = size * cellSize;
    const gridHeight = size * cellSize;
    const cells = [];
    
    // Create cells
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            // Create cell rectangle
            const cell = new fabric.Rect({
                left: col * cellSize,
                top: row * cellSize,
                width: cellSize,
                height: cellSize,
                fill: 'white',
                stroke: 'black',
                strokeWidth: 1
            });
            cells.push(cell);
        }
    }
    
    return new fabric.Group(cells, {
        width: gridWidth,
        height: gridHeight,
        selectable: true,
        subTargetCheck: true,
        hasControls: true
    });
}

function setupObjectControls() {
    // Enable snap-to-grid
    fabricCanvas.gridSnap = true;
    
    fabricCanvas.on('object:moving', function(options) {
        const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
        if (!pageBoundary) return;
        
        const pageLeft = pageBoundary.left;
        const pageTop = pageBoundary.top;
        const pageWidth = pageBoundary.width;
        const pageHeight = pageBoundary.height;
        
        const obj = options.target;
        
        // Keep object within page boundaries
        if (obj.left < pageLeft) obj.left = pageLeft;
        if (obj.top < pageTop) obj.top = pageTop;
        if (obj.left + obj.getScaledWidth() > pageLeft + pageWidth) {
            obj.left = pageLeft + pageWidth - obj.getScaledWidth();
        }
        if (obj.top + obj.getScaledHeight() > pageTop + pageHeight) {
            obj.top = pageTop + pageHeight - obj.getScaledHeight();
        }
        
        // Snap to grid if enabled
        if (fabricCanvas.gridSnap) {
            obj.left = Math.round((obj.left - pageLeft) / GRID_CELL_SIZE) * GRID_CELL_SIZE + pageLeft;
            obj.top = Math.round((obj.top - pageTop) / GRID_CELL_SIZE) * GRID_CELL_SIZE + pageTop;
        }
        
        // Update status display
        updateStatusDisplay(obj);
    });
    
    // Show guide lines when object is selected
    fabricCanvas.on('object:selected', function(options) {
        updateStatusDisplay(options.target);
        updateElementProperties(options.target);
    });
}

function toggleGridSnap() {
    const gridSnapBtn = document.getElementById('toggleGridSnap');
    if (!gridSnapBtn) return;
    
    if (gridSnapBtn.classList.contains('active')) {
        gridSnapBtn.classList.remove('active');
        gridSnapBtn.textContent = 'Enable Grid Snap';
        fabricCanvas.gridSnap = false;
    } else {
        gridSnapBtn.classList.add('active');
        gridSnapBtn.textContent = 'Disable Grid Snap';
        fabricCanvas.gridSnap = true;
    }
}

function updateElementProperties(obj) {
    const propertiesPanel = document.getElementById('elementProperties');
    if (!propertiesPanel || !obj) return;
    
    let html = `<p><strong>Type:</strong> ${obj.type || 'Object'}</p>`;
    
    // Add event handlers for property changes
    propertiesPanel.innerHTML = html;
}

function updateStatusDisplay(obj) {
    const statusElement = document.getElementById('editorStatus');
    if (!statusElement) return;
    
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    // Calculate the relative position on the page (in points)
    const relativeLeft = Math.round((obj.left - pageBoundary.left) / fabricCanvas.pageInfo.scale);
    const relativeTop = Math.round((obj.top - pageBoundary.top) / fabricCanvas.pageInfo.scale);
    
    statusElement.textContent = `Selected: ${obj.id || 'Object'} | Position: ${relativeLeft}pt, ${relativeTop}pt`;
}

function repositionElements() {
    // Find all elements and adjust their positions relative to the new page boundary
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    fabricCanvas.getObjects().forEach(obj => {
        if (obj.id === 'pageBoundary' || obj.id && obj.id.startsWith('gridLine')) {
            return; // Skip the page boundary and grid lines
        }
        
        // If object is outside page, move it inside
        if (obj.left < pageBoundary.left) obj.left = pageBoundary.left + 20;
        if (obj.top < pageBoundary.top) obj.top = pageBoundary.top + 20;
        if (obj.left + obj.getScaledWidth() > pageBoundary.left + pageBoundary.width) {
            obj.left = pageBoundary.left + pageBoundary.width - obj.getScaledWidth() - 20;
        }
        if (obj.top + obj.getScaledHeight() > pageBoundary.top + pageBoundary.height) {
            obj.top = pageBoundary.top + pageBoundary.height - obj.getScaledHeight() - 20;
        }
    });
    
    fabricCanvas.renderAll();
}

// Zoom functionality
function zoomIn() {
    if (currentZoom < MAX_ZOOM) {
        currentZoom += ZOOM_INCREMENT;
        applyZoom();
    }
}

function zoomOut() {
    if (currentZoom > MIN_ZOOM) {
        currentZoom -= ZOOM_INCREMENT;
        applyZoom();
    }
}

function applyZoom() {
    // Update zoom display
    const zoomLevelElement = document.getElementById('zoomLevel');
    if (zoomLevelElement) {
        zoomLevelElement.textContent = `${Math.round(currentZoom * 100)}%`;
    }
    
    // Apply zoom to canvas
    fabricCanvas.setZoom(currentZoom);
    fabricCanvas.setWidth(EDITOR_WIDTH * currentZoom);
    fabricCanvas.setHeight(EDITOR_HEIGHT * currentZoom);
    
    fabricCanvas.renderAll();
}

// Add custom text functionality
function addCustomText() {
    // Create a new text box
    const text = new fabric.Textbox('Custom Text', {
        left: 100,
        top: 100,
        width: 200,
        fontSize: 16,
        fontFamily: 'Times New Roman',
        fill: '#333333',
        editable: true
    });
    
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    showStatus('Added custom text. Click to edit.', 'success');
}

// Clone and delete functionality
function cloneSelectedElement() {
    const activeObject = fabricCanvas.getActiveObject();
    if (!activeObject) {
        showStatus('No element selected to clone', 'error');
        return;
    }
    
    // Clone the object
    activeObject.clone(function(clonedObj) {
        // Position the clone slightly offset from the original
        clonedObj.set({
            left: activeObject.left + 20,
            top: activeObject.top + 20,
            evented: true
        });
        
        fabricCanvas.add(clonedObj);
        fabricCanvas.setActiveObject(clonedObj);
        fabricCanvas.renderAll();
        
        showStatus('Element cloned', 'success');
    });
}

function deleteSelectedElement() {
    const activeObject = fabricCanvas.getActiveObject();
    if (!activeObject) {
        showStatus('No element selected to delete', 'error');
        return;
    }
    
    fabricCanvas.remove(activeObject);
    fabricCanvas.renderAll();
    showStatus('Element deleted', 'success');
}

async function importPuzzle() {
    // Clear any existing status message
    showStatus('');
    
    // Clear existing pages first
    pages = [];
    currentPageIndex = 0;
    
    // Request a file through main process
    const result = await ipcRenderer.invoke('open-file-dialog');
    
    if (result.error) {
        showStatus(`Error loading file: ${result.error}`, 'error');
        return;
    }
    
    if (!result.canceled && result.filePath) {
        currentFilePath = result.filePath;
        currentIpuzData = result.ipuzData;
        
        // Update UI
        document.getElementById('editorSelectedFile').textContent = currentFilePath.split(/[\\/]/).pop();
        
        // Create elements based on the loaded puzzle
        createPuzzlePages(currentIpuzData);
        
        showStatus('Puzzle imported successfully. Use page navigation to view all pages.', 'success');
    }
}

// Fixed implementation of PDF generation
async function generatePdf() {
    // Make sure there's a puzzle loaded
    if (!currentIpuzData) {
        showStatus('Please import a puzzle first.', 'error');
        return;
    }
    
    // Save the current page before generating PDF
    saveCurrentPage();
    
    // Get layout information from the editor
    const layoutSettings = {
        paperSize: document.getElementById('editorPaperSize')?.value || 'letter'
    };
    
    // Show save dialog
    const defaultOutputPath = currentFilePath ? currentFilePath.replace(/\.ipuz$/i, '') + '.pdf' : 'puzzle.pdf';
    const outputPath = await ipcRenderer.invoke('save-file-dialog', defaultOutputPath);
    
    if (!outputPath) {
        // User canceled the save dialog
        return;
    }
    
    // Send data for PDF generation
    showStatus('Converting puzzle to PDF with visual layout...', '');
    
    try {
        const result = await ipcRenderer.invoke('convert-ipuz-to-pdf-visual', {
            ipuzData: currentIpuzData,
            outputPath,
            layoutSettings
        });
        
        if (result.error) {
            showStatus(`Error creating PDF: ${result.error}`, 'error');
        } else {
            showStatus(`PDF created successfully at: ${outputPath}`, 'success');
        }
    } catch (error) {
        showStatus(`Error creating PDF: ${error.message}`, 'error');
    }
}

function createPuzzlePages(ipuzData) {
    if (!ipuzData) return;
    
    console.log("Creating puzzle pages for:", ipuzData);
    
    // Clear any existing pages
    pages = [];
    
    // Create a page for the grid
    addNewPage();
    createGridPage(ipuzData);
    
    // Check for clues in various formats and create pages as needed
    if (ipuzData.clues) {
        console.log("Clues detected:", ipuzData.clues);
        
        // Check for Across clues in different formats
        if (ipuzData.clues.Across) {
            // Array format
            if (Array.isArray(ipuzData.clues.Across) && ipuzData.clues.Across.length > 0) {
                console.log("Across clues found (array):", ipuzData.clues.Across);
                addNewPage();
                createAcrossCluesPage(ipuzData);
            } 
            // Object format (key-value pairs)
            else if (typeof ipuzData.clues.Across === 'object' && Object.keys(ipuzData.clues.Across).length > 0) {
                console.log("Across clues found (object):", ipuzData.clues.Across);
                addNewPage();
                createAcrossCluesPage(ipuzData);
            }
        }
        
        // Check for Down clues in different formats
        if (ipuzData.clues.Down) {
            // Array format
            if (Array.isArray(ipuzData.clues.Down) && ipuzData.clues.Down.length > 0) {
                console.log("Down clues found (array):", ipuzData.clues.Down);
                addNewPage();
                createDownCluesPage(ipuzData);
            } 
            // Object format (key-value pairs)
            else if (typeof ipuzData.clues.Down === 'object' && Object.keys(ipuzData.clues.Down).length > 0) {
                console.log("Down clues found (object):", ipuzData.clues.Down);
                addNewPage();
                createDownCluesPage(ipuzData);
            }
        }
    } else {
        console.log("No clues found in the puzzle data");
    }
    
    // Go back to first page
    currentPageIndex = 0;
    loadPage(currentPageIndex);
}

// Create a grid page with the puzzle grid
function createGridPage(ipuzData) {
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    const pageLeft = pageBoundary.left;
    const pageTop = pageBoundary.top;
    const pageWidth = pageBoundary.width;
    
    // Add title
    titleText = new fabric.Textbox(ipuzData.title || 'Untitled Puzzle', {
        left: pageLeft + pageWidth/2,
        top: pageTop + 40,
        originX: 'center',
        width: pageWidth * 0.8,
        fontSize: 24,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#333333',
        id: 'titleText',
        editable: true
    });
    fabricCanvas.add(titleText);
    
    // Add copyright if available
    if (ipuzData.copyright) {
        const copyrightText = new fabric.Textbox(ipuzData.copyright, {
            left: pageLeft + pageWidth/2,
            top: pageTop + 80,
            originX: 'center',
            width: pageWidth * 0.8,
            fontSize: 12,
            fontFamily: 'Times New Roman',
            textAlign: 'center',
            fill: '#666666',
            id: 'copyrightText',
            editable: true
        });
        fabricCanvas.add(copyrightText);
    }
    
    // Create puzzle grid
    if (ipuzData.puzzle && ipuzData.puzzle.length > 0) {
        const gridSize = ipuzData.puzzle.length;
        const cellSize = 30;
        const gridWidth = gridSize * cellSize;
        
        const grid = createPuzzleGrid(ipuzData, cellSize);
        grid.set({
            left: pageLeft + pageWidth/2 - gridWidth/2,
            top: pageTop + 120,
            id: 'puzzleGrid'
        });
        fabricCanvas.add(grid);
        puzzleGrid = grid;
    } else {
        // Create a placeholder grid if no puzzle data
        const gridSize = 5;
        const cellSize = 30;
        const gridWidth = gridSize * cellSize;
        
        const grid = createEmptyGrid(gridSize, cellSize);
        grid.set({
            left: pageLeft + pageWidth/2 - gridWidth/2,
            top: pageTop + 120,
            id: 'puzzleGrid'
        });
        fabricCanvas.add(grid);
        puzzleGrid = grid;
    }
    
    fabricCanvas.renderAll();
}

// Create a page for Across clues
function createAcrossCluesPage(ipuzData) {
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    const pageLeft = pageBoundary.left;
    const pageTop = pageBoundary.top;
    const pageWidth = pageBoundary.width;
    
    // Add title
    const titleText = new fabric.Textbox(ipuzData.title || 'Untitled Puzzle', {
        left: pageLeft + pageWidth/2,
        top: pageTop + 40,
        originX: 'center',
        width: pageWidth * 0.8,
        fontSize: 24,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#333333',
        id: 'titleText',
        editable: true
    });
    fabricCanvas.add(titleText);
    
    // Add ACROSS clues section
    const acrossHeader = new fabric.Text('ACROSS', {
        left: pageLeft + 50,
        top: pageTop + 100,
        fontSize: 18,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        fill: '#333333',
        id: 'acrossHeader'
    });
    
    fabricCanvas.add(acrossHeader);
    
    // Create clues text - handle different IPUZ clue formats
    let cluesText = '';
    
    console.log("Processing Across clues:", ipuzData.clues?.Across);
    
    if (ipuzData.clues && ipuzData.clues.Across) {
        // Handle different clue formats
        if (Array.isArray(ipuzData.clues.Across)) {
            // Format 1: [[number, text], [number, text]]
            ipuzData.clues.Across.forEach(clue => {
                if (Array.isArray(clue) && clue.length >= 2) {
                    cluesText += `${clue[0]}. ${clue[1]}\n\n`;
                }
            });
        } else if (typeof ipuzData.clues.Across === 'object') {
            // Format 2: {1: "clue text", 2: "clue text"}
            Object.entries(ipuzData.clues.Across).forEach(([num, text]) => {
                cluesText += `${num}. ${text}\n\n`;
            });
        }
    }
    
    if (!cluesText) {
        cluesText = 'No across clues available';
    }
    
    // Add clues
    const acrossClues = new fabric.Textbox(cluesText, {
        left: pageLeft + 50,
        top: pageTop + 130,
        width: pageWidth - 100,
        fontSize: 14,
        fontFamily: 'Times New Roman',
        fill: '#555555',
        id: 'acrossClues',
        editable: true,
        lineHeight: 1.3
    });
    
    fabricCanvas.add(acrossClues);
    fabricCanvas.renderAll();
}

// Create a page for Down clues
function createDownCluesPage(ipuzData) {
    const pageBoundary = fabricCanvas.getObjects().find(obj => obj.id === 'pageBoundary');
    if (!pageBoundary) return;
    
    const pageLeft = pageBoundary.left;
    const pageTop = pageBoundary.top;
    const pageWidth = pageBoundary.width;
    
    // Add title
    const titleText = new fabric.Textbox(ipuzData.title || 'Untitled Puzzle', {
        left: pageLeft + pageWidth/2,
        top: pageTop + 40,
        originX: 'center',
        width: pageWidth * 0.8,
        fontSize: 24,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#333333',
        id: 'titleText',
        editable: true
    });
    fabricCanvas.add(titleText);
    
    // Add DOWN clues section
    const downHeader = new fabric.Text('DOWN', {
        left: pageLeft + 50,
        top: pageTop + 100,
        fontSize: 18,
        fontFamily: 'Times New Roman',
        fontWeight: 'bold',
        fill: '#333333',
        id: 'downHeader'
    });
    
    fabricCanvas.add(downHeader);
    
    // Create clues text - handle different IPUZ clue formats
    let cluesText = '';
    
    console.log("Processing Down clues:", ipuzData.clues?.Down);
    
    if (ipuzData.clues && ipuzData.clues.Down) {
        // Handle different clue formats
        if (Array.isArray(ipuzData.clues.Down)) {
            // Format 1: [[number, text], [number, text]]
            ipuzData.clues.Down.forEach(clue => {
                if (Array.isArray(clue) && clue.length >= 2) {
                    cluesText += `${clue[0]}. ${clue[1]}\n\n`;
                }
            });
        } else if (typeof ipuzData.clues.Down === 'object') {
            // Format 2: {1: "clue text", 2: "clue text"}
            Object.entries(ipuzData.clues.Down).forEach(([num, text]) => {
                cluesText += `${num}. ${text}\n\n`;
            });
        }
    }
    
    if (!cluesText) {
        cluesText = 'No down clues available';
    }
    
    // Add clues
    const downClues = new fabric.Textbox(cluesText, {
        left: pageLeft + 50,
        top: pageTop + 130,
        width: pageWidth - 100,
        fontSize: 14,
        fontFamily: 'Times New Roman',
        fill: '#555555',
        id: 'downClues',
        editable: true,
        lineHeight: 1.3
    });
    
    fabricCanvas.add(downClues);
    fabricCanvas.renderAll();
}

// Create a puzzle grid from IPUZ data
function createPuzzleGrid(ipuzData, cellSize) {
    if (!ipuzData.puzzle || !ipuzData.puzzle.length) {
        return createEmptyGrid(5, cellSize);
    }
    
    const gridSize = ipuzData.puzzle.length;
    const gridWidth = gridSize * cellSize;
    const gridHeight = gridSize * cellSize;
    const cells = [];
    
    console.log("Creating puzzle grid with size:", gridSize);
    
    // Create cells
    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cell = ipuzData.puzzle[row][col];
            
            // Check if it's a black cell - handle different IPUZ formats
            let isBlackCell = false;
            
            // Debug the cell data
            console.log(`Cell at [${row},${col}]:`, cell);
            
            if (cell === '#' || cell === 0 || cell === null) {
                isBlackCell = true;
            } else if (typeof cell === 'object') {
                // In some formats, cell=0 or value='#' indicates a black cell
                if (cell.cell === 0 || cell.value === '#') {
                    isBlackCell = true;
                }
                // In other formats, the absence of a 'cell' property or a 'value' property might indicate a black cell
                else if (!cell.hasOwnProperty('cell') && !cell.hasOwnProperty('value')) {
                    isBlackCell = true;
                }
            }
            
            // If we're getting inverted coloring, flip the black/white determination
            isBlackCell = !isBlackCell;
            
            // Create cell rectangle
            const cellRect = new fabric.Rect({
                left: col * cellSize,
                top: row * cellSize,
                width: cellSize,
                height: cellSize,
                fill: isBlackCell ? 'black' : 'white',
                stroke: 'black',
                strokeWidth: 1
            });
            cells.push(cellRect);
            
            // Add cell number if available
            if (!isBlackCell) {
                let cellNumber = null;
                
                // Handle different IPUZ formats for cell numbers
                if (typeof cell === 'object') {
                    if (cell.cell > 0) {
                        cellNumber = cell.cell;
                    } else if (cell.number > 0) {
                        cellNumber = cell.number;
                    }
                }
                
                if (cellNumber && cellNumber > 0) {
                    const numText = new fabric.Text(cellNumber.toString(), {
                        left: col * cellSize + 2,
                        top: row * cellSize + 2,
                        fontSize: 10,
                        fontFamily: 'Arial'
                    });
                    cells.push(numText);
                }
            }
        }
    }
    
    return new fabric.Group(cells, {
        width: gridWidth,
        height: gridHeight,
        selectable: true,
        subTargetCheck: true,
        hasControls: true
    });
}

function returnToSettings() {
    window.location.href = 'index.html';
}

function showStatus(message, type) {
    const statusElement = document.getElementById('editorStatus');
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = 'editor-status';
    
    if (type) {
        statusElement.classList.add(type);
    }
}
